import type { Config } from '../config/config.types';
import type { Document } from '../documents/documents.types';
import type { OrganizationsRepository } from '../organizations/organizations.repository';
import type { Logger } from '../shared/logger/logger';
import type { TagsRepository } from '../tags/tags.repository';
import type { TaggingRuleOperatorValidatorRegistry } from './conditions/tagging-rule-conditions.registry';
import type { TaggingRulesRepository } from './tagging-rules.repository';
import type { TaggingRuleField, TaggingRuleOperator } from './tagging-rules.types';
import { safely, safelySync } from '@corentinth/chisels';
import { GoogleGenAI } from '@google/genai';

import { uniq } from 'lodash-es';
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
  apiKey,
  logger,
}: {
  content: string;
  apiKey: string;
  logger: Logger;
}): Promise<string[]> {
  if (!apiKey) {
    return [];
  }

  try {
    const genAI = new GoogleGenAI(apiKey);

    const prompt = `As an expert document archivist, your role is to generate relevant tags for the following document.

**Instructions:**
1.  Carefully read and understand the main subject, purpose, and key entities in the document content.
2.  Generate a maximum of 5 tags that best summarize the document.
3.  The tags must be concise, specific, and directly related to the content.
4.  Your final output must be ONLY a single, valid JSON array of strings, with no additional text or explanations before or after it.

**Good Tag Examples:**
- ["invoice", "project-alpha", "q3-2024"]
- ["legal-contract", "nda", "acme-corp"]

**Bad Tag Examples:**
- ["important", "document", "text"]

**Content to Analyze:**
\`\`\`
${content}
\`\`\``;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
    });
    const text = response.text.trim().replace(/```json|```/g, '');
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
    const suggestedTagNames = await getAiSuggestedTags({ content: document.content, apiKey: config.gemini.apiKey, logger });
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
