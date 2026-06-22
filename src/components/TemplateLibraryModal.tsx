'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock3, FileText, Loader2, Search, SearchX, ShieldCheck, X } from 'lucide-react';
import { BenzEmptyState } from '@/components/BenzEmptyState';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getRecentTemplateRefs, recordRecentTemplate, type RecentTemplateRef } from '@/lib/recentTemplates';
import { getTemplateInsertText } from '@/lib/templateLibrary';
import type { StoryTemplate, TemplateCategory } from '@/types';

interface TemplateLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (content: string, title: string, category: TemplateCategory) => void;
}

type TabId = TemplateCategory;

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode; description: string }> = [
  {
    id: 'customer',
    label: 'Customer Pay',
    icon: <FileText size={16} />,
    description: 'Maintenance and customer-pay service narratives',
  },
  {
    id: 'warranty',
    label: 'Warranty Claims',
    icon: <ShieldCheck size={16} />,
    description: 'Pre-approved 3 C\'s warranty story templates',
  },
];

export function TemplateLibraryModal({ open, onClose, onInsert }: TemplateLibraryModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('warranty');
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recentRefs, setRecentRefs] = useState<RecentTemplateRef[]>([]);
  const loadSeqRef = useRef(0);

  const loadTemplates = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const { templates: rows } = await api.listTemplates();
      if (seq !== loadSeqRef.current) return;

      setTemplates(rows);
      setRecentRefs(getRecentTemplateRefs());
      setSelectedId((current) => {
        if (current && rows.some((t) => t.id === current)) return current;
        const firstWarranty = rows.find((t) => t.category === 'warranty') || rows[0];
        return firstWarranty?.id ?? null;
      });
    } catch (e) {
      if (seq === loadSeqRef.current) {
        setTemplates([]);
        setSelectedId(null);
        toast.error(e instanceof Error ? e.message : 'Failed to load templates');
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) {
      loadSeqRef.current += 1;
      setSearch('');
      setInsertingId(null);
      setActiveTab('warranty');
      return;
    }
    void loadTemplates();
  }, [open, loadTemplates]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !insertingId) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, insertingId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates
      .filter((t) => t.category === activeTab)
      .filter((t) => !term || t.title.toLowerCase().includes(term) || t.content.toLowerCase().includes(term));
  }, [templates, activeTab, search]);

  const recentTemplates = useMemo(() => {
    const byId = new Map(templates.map((t) => [t.id, t]));
    return recentRefs
      .map((ref) => byId.get(ref.id))
      .filter((t): t is StoryTemplate => !!t && t.category === activeTab)
      .slice(0, 6);
  }, [recentRefs, templates, activeTab]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((t) => t.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selected = filtered.find((t) => t.id === selectedId) ?? null;

  const tabCounts = useMemo(
    () => ({
      customer: templates.filter((t) => t.category === 'customer').length,
      warranty: templates.filter((t) => t.category === 'warranty').length,
    }),
    [templates]
  );

  const handleInsert = async (template: StoryTemplate) => {
    if (insertingId) return;
    setInsertingId(template.id);
    try {
      try {
        await api.recordTemplateUse(template.id);
      } catch {
        // Non-blocking — local recent list still works
      }
      const exactText = getTemplateInsertText(template);
      recordRecentTemplate({
        id: template.id,
        title: template.title,
        category: template.category,
      });
      setRecentRefs(getRecentTemplateRefs());
      onInsert(exactText, template.title, template.category);
      if (template.category === 'customer') {
        toast.success(`Inserted "${template.title}" — exact saved text, no AI rewrite`);
      } else {
        toast.success(`Inserted "${template.title}" into story`);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to insert template');
    } finally {
      setInsertingId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="benz-modal-overlay z-[110]">
      <div className="benz-modal-panel sm:max-w-3xl flex flex-col">
        <div className="benz-modal-header">
          <div>
            <div className="flex items-center gap-2 text-benz-blue mb-1">
              <BookOpen size={18} />
              <span className="text-xs uppercase tracking-[0.2em] font-semibold">Template Library</span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Mercedes-Benz Story Templates</h2>
            <p className="text-xs text-benz-secondary mt-1">One-click insert — grows smarter when you save new templates</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!insertingId}
            className="benz-icon-btn border border-benz-surface-3 disabled:opacity-50"
            aria-label="Close template library"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`benz-tab-btn ${activeTab === tab.id ? 'benz-tab-btn-active' : ''}`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {tab.icon}
                {tab.label}
                <span className="ml-auto text-xs opacity-80">{tabCounts[tab.id]}</span>
              </div>
              <div className="text-xs mt-0.5 opacity-80">{tab.description}</div>
            </button>
          ))}
        </div>

        {recentTemplates.length > 0 && (
          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 benz-section-title mb-2">
              <Clock3 size={14} />
              Recently Used
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentTemplates.map((template) => (
                <button
                  key={`recent-${template.id}`}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={`benz-chip ${selected?.id === template.id ? 'benz-chip-active' : ''}`}
                >
                  <div className="text-xs font-medium max-w-[160px] truncate">{template.title}</div>
                  {template.source === 'user' && (
                    <div className="text-xs text-benz-green mt-0.5">Your template</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-benz-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTab === 'customer' ? 'customer pay' : 'warranty'} templates...`}
              className="benz-search pl-10"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[220px_1fr] benz-divider">
          <div className="sm:border-r border-benz-surface-3 overflow-y-auto max-h-[28dvh] sm:max-h-none">
            {loading ? (
              <div className="p-4 text-sm text-benz-secondary flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-benz-blue" />
                Loading templates…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4">
                <BenzEmptyState
                  icon={SearchX}
                  title="No templates match your search"
                  hint="Try a different keyword or switch between warranty and customer pay tabs."
                  compact
                />
              </div>
            ) : (
              filtered.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={`w-full text-left px-4 py-3 border-b border-benz-surface-3 transition-colors ${
                    selected?.id === template.id
                      ? 'bg-benz-accent/10 text-benz-primary'
                      : 'hover:bg-benz-surface-2 text-benz-silver'
                  }`}
                >
                  <div className="text-sm font-medium leading-snug">{template.title}</div>
                  {template.source === 'user' && (
                    <div className="text-xs text-benz-green mt-0.5">Saved by your team</div>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="flex flex-col min-h-0">
            {selected ? (
              <>
                <div className="px-4 py-3 border-b border-benz-surface-3">
                  <div className="text-sm font-semibold tracking-tight">{selected.title}</div>
                  <div className="text-xs text-benz-secondary mt-0.5">
                    {selected.category === 'customer' ? 'Customer Pay Template' : 'Warranty Claim Template'}
                    {selected.source === 'user' ? ' • Dealership' : ' • Standard'}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-benz-silver font-sans">
                    {selected.content}
                  </pre>
                </div>
                <div className="p-4 border-t border-benz-surface-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleInsert(selected)}
                    disabled={!!insertingId}
                    className="primary-btn flex-1 h-11 text-sm flex items-center justify-center gap-2 disabled:opacity-60 touch-target"
                  >
                    {insertingId === selected.id ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Inserting…
                      </>
                    ) : (
                      'Insert into story'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={!!insertingId}
                    className="secondary-btn h-11 px-4 text-sm disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-benz-secondary">
                {loading ? 'Loading templates…' : 'Select a template to preview.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}