import type { Component } from 'solid-js';
import { createSignal, onMount } from 'solid-js';
import { fetchIngestionStatus, startIngestion, stopIngestion, updateIngestionConfig } from '@/modules/ingestion/ingestion.services';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';

export const IngestionSettingsCard: Component = () => {
  const [status, setStatus] = createSignal<{ isEnabled: boolean; folderRootPath: string; pollingInterval: number; processingConcurrency: number }>();
  const [pollingInterval, setPollingInterval] = createSignal<number | undefined>();
  const [concurrency, setConcurrency] = createSignal<number | undefined>();

  const refresh = async () => {
    const s = await fetchIngestionStatus();
    setStatus(s);
    setPollingInterval(s.pollingInterval);
    setConcurrency(s.processingConcurrency);
  };

  onMount(refresh);

  const onStart = async () => {
    await startIngestion();
    createToast({ type: 'success', message: 'Ingestion started' });
    await refresh();
  };
  const onStop = async () => {
    await stopIngestion();
    createToast({ type: 'success', message: 'Ingestion stopped' });
    await refresh();
  };
  const onSave = async () => {
    await updateIngestionConfig({ pollingInterval: pollingInterval(), processingConcurrency: concurrency() });
    createToast({ type: 'success', message: 'Saved' });
    await refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingestion</CardTitle>
        <CardDescription>Watch a local folder to import files automatically.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <div class="text-sm text-muted-foreground">Root:</div>
        <div class="text-sm text-muted-foreground">{status()?.folderRootPath ?? '-'}</div>
        <div class="flex gap-2 items-center">
          <Button onClick={onStart} disabled={status()?.isEnabled}>Start</Button>
          <Button variant="outline" onClick={onStop} disabled={!status()?.isEnabled}>Stop</Button>
        </div>
        <div class="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <TextFieldRoot>
              <TextFieldLabel>Polling interval (ms)</TextFieldLabel>
              <TextField type="number" value={pollingInterval()} onInput={e => setPollingInterval(Number(e.currentTarget.value))} />
            </TextFieldRoot>
          </div>
          <div>
            <TextFieldRoot>
              <TextFieldLabel>Concurrency</TextFieldLabel>
              <TextField type="number" value={concurrency()} onInput={e => setConcurrency(Number(e.currentTarget.value))} />
            </TextFieldRoot>
          </div>
        </div>
        <div>
          <Button onClick={onSave}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
};
