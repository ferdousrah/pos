import { Tabs } from '@/components/ui/Layout';
import { useCan } from '@/lib/session';
import { settingsTabs } from '@/navigation';

export function SettingsTabs() {
    const can = useCan();
    return <Tabs tabs={settingsTabs.filter((tab) => can(tab.permission))} />;
}
