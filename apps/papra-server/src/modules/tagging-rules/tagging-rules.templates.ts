import type { TaggingRulesRepository } from './tagging-rules.repository';
import type { TagsRepository } from '../tags/tags.repository';

const templatesMap = {
  finance: {
    tags: ['finance','invoice','receipt','bank','tax'],
    rules: [
      { field: 'name', operator: 'contains', value: 'invoice' },
      { field: 'content', operator: 'contains', value: 'invoice' },
      { field: 'name', operator: 'contains', value: 'receipt' },
      { field: 'content', operator: 'contains', value: 'receipt' },
      { field: 'content', operator: 'contains', value: 'bank' },
      { field: 'content', operator: 'contains', value: 'tax' },
    ],
    applyActionsTag: 'finance',
  },
  legal: {
    tags: ['legal','contract','agreement','policy','nda'],
    rules: [
      { field: 'content', operator: 'contains', value: 'contract' },
      { field: 'content', operator: 'contains', value: 'agreement' },
      { field: 'content', operator: 'contains', value: 'policy' },
      { field: 'content', operator: 'contains', value: 'nda' },
    ],
    applyActionsTag: 'legal',
  },
  personal: {
    tags: ['personal','passport','certificate','medical'],
    rules: [
      { field: 'content', operator: 'contains', value: 'passport' },
      { field: 'content', operator: 'contains', value: 'certificate' },
      { field: 'content', operator: 'contains', value: 'medical' },
    ],
    applyActionsTag: 'personal',
  },
} as const;

export async function createTaggingRulesTemplate({ organizationId, templates, tagsRepository, taggingRulesRepository }: {
  organizationId: string;
  templates: Array<'finance'|'legal'|'personal'>;
  tagsRepository: TagsRepository;
  taggingRulesRepository: TaggingRulesRepository;
}) {
  const wanted = templates.map(t => templatesMap[t]);

  // Ensure tags exist
  const { tags: existing } = await tagsRepository.getOrganizationTags({ organizationId });
  const existingByName = new Map(existing.map(t => [t.name.toLowerCase(), t]));
  const toCreate = [...new Set(wanted.flatMap(t => t.tags))]
    .filter(name => !existingByName.has(name));
  if (toCreate.length > 0) {
    await tagsRepository.createManyTags({ tags: toCreate.map(name => ({ name, color: '#888888', organizationId })) });
  }

  // Idempotent upsert: for each template create or update rule named "<template>-template"
  const { taggingRules: existingRules } = await taggingRulesRepository.getOrganizationTaggingRules({ organizationId });
  const existingByRuleName = new Map(existingRules.map(r => [r.name.toLowerCase(), r]));

  for (const t of wanted) {
    const actionsTagName = t.applyActionsTag;
    const ruleName = `${actionsTagName}-template`;

    const { tags: nowTags } = await tagsRepository.getOrganizationTags({ organizationId });
    const byName = new Map(nowTags.map(x => [x.name.toLowerCase(), x]));
    const actionTagId = byName.get(actionsTagName)!.id;

    const existing = existingByRuleName.get(ruleName.toLowerCase());
    if (existing) {
      await taggingRulesRepository.updateOrganizationTaggingRule({
        organizationId,
        taggingRuleId: existing.id,
        taggingRule: {
          name: ruleName,
          description: existing.description,
          enabled: true,
          conditions: t.rules.map(r => ({ ...r })),
          tagIds: [actionTagId],
        },
      });
    } else {
      const { taggingRule } = await taggingRulesRepository.createTaggingRule({ taggingRule: { name: ruleName, organizationId, enabled: true } as any });
      await taggingRulesRepository.createTaggingRuleConditions({ taggingRuleId: taggingRule.id, conditions: t.rules.map(r => ({ ...r })) });
      await taggingRulesRepository.createTaggingRuleActions({ taggingRuleId: taggingRule.id, tagIds: [actionTagId] });
    }
  }
}


