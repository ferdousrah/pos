import { ArrowUpRight, Boxes, Landmark, ReceiptText, Search, Truck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchInput } from '@/components/ui/Field';
import { Page, PageHeader, Tabs } from '@/components/ui/Layout';
import { Empty } from '@/components/ui/Table';
import { reportTabs } from './common';
import { reportGroups, reports } from './catalog';

const groupIcons = { Sales: ReceiptText, Inventory: Boxes, Purchases: Truck, Money: Landmark, Customers: Users };
const tints = { Sales: '#e3ec78', Inventory: '#7fd6c8', Purchases: '#a9bdf7', Money: '#f7b995', Customers: '#f3a8c4' };

export default function Library() {
    const [search, setSearch] = useState('');
    const term = search.trim().toLowerCase();
    const matches = reports.filter((report) => !term || `${report.title} ${report.description} ${report.group}`.toLowerCase().includes(term));

    return (
        <Page>
            <PageHeader
                title="Reports"
                description={`${reports.length} reports you can filter, sort and export to Excel, CSV or PDF.`}
                actions={<SearchInput value={search} onChange={setSearch} placeholder="Find a report" />}
            />
            <Tabs tabs={reportTabs} />

            {matches.length === 0 && <Empty icon={<Search />} title="No report matches" hint="Try a different word." />}

            <div className="space-y-7">
                {reportGroups.map((group) => {
                    const items = matches.filter((report) => report.group === group);
                    if (items.length === 0) return null;
                    const Icon = groupIcons[group];

                    return (
                        <section key={group}>
                            <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-medium">
                                <span className="grid size-8 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${tints[group]} 60%, var(--surface))` }}>
                                    <Icon className="size-4" />
                                </span>
                                {group}
                                <span className="text-[13px] font-normal text-ink-3">{items.length}</span>
                            </h2>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {items.map((report) => (
                                    <Link
                                        key={report.key}
                                        to={`/reports/view/${report.key}`}
                                        className="lift group flex items-start justify-between gap-4 rounded-[20px] bg-surface p-5 shadow-card dark:ring-1 dark:ring-line"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-[14.5px] font-medium">{report.title}</span>
                                            <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{report.description}</span>
                                        </span>
                                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink transition-[rotate,background-color] duration-500 ease-smooth group-hover:rotate-45 group-hover:bg-accent">
                                            <ArrowUpRight className="size-4" />
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </Page>
    );
}
