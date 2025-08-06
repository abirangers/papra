import type { Config } from '../config/config.types';
import type { Document } from '../documents/documents.types';
import type { OrganizationsRepository } from '../organizations/organizations.repository';
import type { Logger } from '../shared/logger/logger';
import type { TagsRepository } from '../tags/tags.repository';
import type { TaggingRuleOperatorValidatorRegistry } from './conditions/tagging-rule-conditions.registry';
import type { TaggingRulesRepository } from './tagging-rules.repository';
import type { TaggingRuleField, TaggingRuleOperator } from './tagging-rules.types';
import { safely, safelySync } from '@corentinth/chisels';
import { uniq } from 'lodash-es';
import { Ollama } from 'ollama-node';
import { z } from 'zod';
import { createLogger } from '../shared/logger/logger';
import { createTaggingRuleOperatorValidatorRegistry } from './conditions/tagging-rule-conditions.registry';
import { getDocumentFieldValue } from './tagging-rules.models';

export async function createTaggingRule({
  name,
  description,
  enabled,
  conditions,
  tagIds,
  organizationId,

  taggingRulesRepository,
}: {
  name: string;
  description: string | undefined;
  enabled: boolean | undefined;
  conditions: {
    field: TaggingRuleField;
    operator: TaggingRuleOperator;
    value: string;
  }[];
  tagIds: string[];
  organizationId: string;

  taggingRulesRepository: TaggingRulesRepository;
}) {
  const { taggingRule } = await taggingRulesRepository.createTaggingRule({
    taggingRule: {
      name,
      description,
      enabled,
      organizationId,
    },
  });

  const { id: taggingRuleId } = taggingRule;

  await Promise.all([
    conditions.length > 0 && taggingRulesRepository.createTaggingRuleConditions({ taggingRuleId, conditions }),
    taggingRulesRepository.createTaggingRuleActions({ taggingRuleId, tagIds }),
  ]);
}

const AITagsSchema = z.array(z.string());

async function getAiSuggestedTags({
  content,
  config,
  logger,
}: {
  content:string;
  config: Config['ollama'];
  logger: Logger;
}): Promise<string[]> {
  const { baseUrl, model } = config;
  if (!baseUrl || !model) {
    return [];
  }

  try {
    const ollama = new Ollama(baseUrl);

    const prompt = `You are an expert document archivist. Based on the following document content, suggest a maximum of 5 relevant tags. Return the tags as a JSON array of strings. For example: ["invoice", "finance", "2024"]. Do not return anything else but the JSON array. The content is: "${content}"`;

    const response = await ollama.generate(model, prompt);
    const text = response.output.trim().replace(/```json|```/g, '');
    const json = JSON.parse(text);

    const parsed = AITagsSchema.safeParse(json);

    if (parsed.success) {
      return parsed.data;
    }

    logger.error({ error: parsed.error, text }, 'Failed to parse AI suggested tags');
    return [];
  } catch (error) {
    logger.error({ error }, 'Failed to get AI suggested tags from the provider');
    return [];
  }
}

export async function applyTaggingRules({
  document,
  config,
  taggingRulesRepository,
  tagsRepository,
  organizationsRepository,
  taggingRuleOperatorValidatorRegistry = createTaggingRuleOperatorValidatorRegistry(),
  logger = createLogger({ namespace: 'tagging-rules' }),
}: {
  document: Document;
  config: Config;
  organizationsRepository: OrganizationsRepository;
  taggingRulesRepository: TaggingRulesRepository;
  taggingRuleOperatorValidatorRegistry?: TaggingRuleOperatorValidatorRegistry;
  tagsRepository: TagsRepository;
  logger?: Logger;
}) {
  // 1. Apply rule-based tags
  const { taggingRules } = await taggingRulesRepository.getOrganizationEnabledTaggingRules({ organizationId: document.organizationId });
  const taggingRulesToApplyActions = taggingRules.filter(taggingRule => taggingRule.conditions.every(({ operator, field, value: conditionValue, isCaseSensitive }) => {
    const { validate } = taggingRuleOperatorValidatorRegistry.getTaggingRuleOperatorValidator({ operator });
    const { fieldValue } = getDocumentFieldValue({ document, field });
    const [isValid, error] = safelySync(() => validate({ conditionValue, fieldValue, isCaseSensitive }));
    if (error) {
      logger.error({ error, conditionValue, fieldValue, isCaseSensitive }, 'Failed to validate tagging rule condition');
      return false;
    }
    return isValid;
  }));
  const ruleBasedTagIds = uniq(taggingRulesToApplyActions.flatMap(taggingRule => taggingRule.actions.map(action => action.tagId)));

  // 2. Apply AI-based tags
  const { organization } = await organizationsRepository.getOrganizationById({ organizationId: document.organizationId });
  let aiSuggestedTagIds: string[] = [];
  if (organization?.aiTaggingEnabled && document.content) {
    const suggestedTagNames = await getAiSuggestedTags({ content: document.content, config: config.ollama, logger });
    if (suggestedTagNames.length > 0) {
      const { tags: existingOrgTags } = await tagsRepository.getOrganizationTags({ organizationId: document.organizationId });
      const lowercasedExistingTags = new Map(existingOrgTags.map(t => [t.name.toLowerCase(), t]));

      const newTagNames = suggestedTagNames.filter(name => !lowercasedExistingTags.has(name.toLowerCase()));
      const existingTagIds = suggestedTagNames
        .map(name => lowercasedExistingTags.get(name.toLowerCase())?.id)
        .filter((id): id is string => !!id);

      let newTagIds: string[] = [];
      if (newTagNames.length > 0) {
        const { tags: newTags } = await tagsRepository.createManyTags({
          tags: newTagNames.map(name => ({
            name,
            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
            organizationId: document.organizationId,
          })),
        });
        newTagIds = newTags.map(t => t.id);
      }

      aiSuggestedTagIds = [...existingTagIds, ...newTagIds];
    }
  }

  // 3. Combine and apply all tags
  const tagIdsToApply = uniq([...ruleBasedTagIds, ...aiSuggestedTagIds]);
  if (tagIdsToApply.length > 0) {
    const appliedTagIds = await Promise.all(tagIdsToApply.map(async (tagId) => {
      const [, error] = await safely(async () => tagsRepository.addTagToDocument({ tagId, documentId: document.id }));
      if (error) {
        logger.error({ error, tagId, documentId: document.id }, 'Failed to add tag to document');
        return;
      }
      return tagId;
    }));

    logger.info({
      ruleBasedTagIds,
      aiSuggestedTagIds,
      appliedTagIds: appliedTagIds.filter(Boolean),
    }, 'Tagging rules and suggestions applied');
  }
}
