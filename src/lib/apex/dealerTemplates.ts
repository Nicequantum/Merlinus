/**
 * APEX NATIONAL PLATFORM — dealership provision templates.
 * Templates control login strategy and feature defaults — never display names.
 * Rooftop UI name always comes from provision input (`rooftopName` → Dealership.name).
 */

export const DEALER_TEMPLATE_IDS = ['mercedes-rooftop-v1', 'generic-rooftop-v1'] as const;
export type DealerTemplateId = (typeof DEALER_TEMPLATE_IDS)[number];

export type BrandKey = 'mercedes' | 'generic';
export type StaffLoginStrategy = 'd7' | 'apex_username' | 'email';

export interface DealerTemplate {
  id: DealerTemplateId;
  brand: BrandKey;
  /** How the service manager authenticates at this rooftop. */
  loginStrategy: StaffLoginStrategy;
  defaultManagerRole: 'manager';
  features: {
    customerPay: boolean;
    voice: boolean;
    /** Mercedes Xentry diagnostic flows. */
    xentry: boolean;
  };
  seed: {
    /** v1: use global catalog only — do not clone Tiverton user templates. */
    copyGlobalTemplates: boolean;
    createPlaceholderAdvisor: boolean;
  };
}

const TEMPLATES: Record<DealerTemplateId, DealerTemplate> = {
  'mercedes-rooftop-v1': {
    id: 'mercedes-rooftop-v1',
    brand: 'mercedes',
    loginStrategy: 'd7',
    defaultManagerRole: 'manager',
    features: {
      customerPay: true,
      voice: true,
      xentry: true,
    },
    seed: {
      copyGlobalTemplates: false,
      createPlaceholderAdvisor: false,
    },
  },
  'generic-rooftop-v1': {
    id: 'generic-rooftop-v1',
    brand: 'generic',
    loginStrategy: 'apex_username',
    defaultManagerRole: 'manager',
    features: {
      customerPay: true,
      voice: true,
      xentry: false,
    },
    seed: {
      copyGlobalTemplates: false,
      createPlaceholderAdvisor: false,
    },
  },
};

export function listDealerTemplates(): DealerTemplate[] {
  return Object.values(TEMPLATES);
}

export function getDealerTemplate(id: string): DealerTemplate | null {
  const key = id.trim() as DealerTemplateId;
  return TEMPLATES[key] ?? null;
}

export function isDealerTemplateId(id: string): id is DealerTemplateId {
  return (DEALER_TEMPLATE_IDS as readonly string[]).includes(id.trim());
}
