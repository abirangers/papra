import type { Document } from '../documents/documents.types';
import type { Logger } from '../shared/logger/logger';
import type { TagsRepository } from '../tags/tags.repository';
import type { TaggingRuleOperatorValidatorRegistry } from './conditions/tagging-rule-conditions.registry';
import type { TaggingRulesRepository } from './tagging-rules.repository';
import type { TaggingRuleField, TaggingRuleOperator } from './tagging-rules.types';
import { safely, safelySync } from '@corentinth/chisels';
import { uniq } from 'lodash-es';
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

import { GoogleGenAI } from '@google/genai';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { Config } from '../config/config.types';
import { OrganizationsRepository } from '../organizations/organizations.repository';

async function getAiSuggestedTags({ content, apiKey }: { content: string; apiKey: string }): Promise<string[]> {
  if (!apiKey) {
    return [];
  }

  const genAI = new GoogleGenAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are an expert document archivist. Based on the following document content, suggest a maximum of 5 relevant tags. Return the tags as a JSON array of strings. For example: ["invoice", "finance", "2024"]. Do not return anything else but the JSON array. The content is: "${content}"`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim().replace(/```json|```/g, '');
    const tags = JSON.parse(text);
    if (Array.isArray(tags) && tags.every(t => typeof t === 'string')) {
      return tags;
    }
    return [];
  } catch (error) {
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
    const suggestedTagNames = await getAiSuggestedTags({ content: document.content, apiKey: config.gemini.apiKey });
    if (suggestedTagNames.length > 0) {
      const { tags: existingOrgTags } = await tagsRepository.getOrganizationTags({ organizationId: document.organizationId });
      const lowercasedExistingTags = new Map(existingOrgTags.map(t => [t.name.toLowerCase(), t]));

      const tagIds = await Promise.all(suggestedTagNames.map(async (tagName) => {
        const existingTag = lowercasedExistingTags.get(tagName.toLowerCase());
        if (existingTag) {
          return existingTag.id;
        }
        const color = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
        const { tag: newTag } = await tagsRepository.createTag({ tag: { name: tagName, color, organizationId: document.organizationId } });
        return newTag?.id;
      }));
      aiSuggestedTagIds = tagIds.filter(id => id !== undefined) as string[];
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
