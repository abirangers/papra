import type { Component } from 'solid-js';
import type { Organization } from '../organizations.types';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useUpdateOrganization } from '../organizations.composables';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { Switch } from '@/modules/ui/components/switch';
import { createToast } from '@/modules/ui/components/sonner';

export const AiTaggingSettingsCard: Component<{ organization: Organization }> = (props) => {
  const { t } = useI18n();
  const { updateOrganization } = useUpdateOrganization();

  const handleToggle = async (checked: boolean) => {
    await updateOrganization({
      organizationId: props.organization.id,
      aiTaggingEnabled: checked,
    });
    createToast({ type: 'success', message: t('organization.settings.ai-tagging.updated') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('organization.settings.ai-tagging.title')}</CardTitle>
        <CardDescription>
          {t('organization.settings.ai-tagging.description')}
        </CardDescription>
      </CardHeader>
      <CardContent class="flex items-center justify-between">
        <p class="font-medium">{t('organization.settings.ai-tagging.enable-label')}</p>
        <Switch
          checked={props.organization.aiTaggingEnabled}
          onCheckedChange={handleToggle}
        />
      </CardContent>
    </Card>
  );
};
