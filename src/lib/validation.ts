import type { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, VALIDATION_ERROR } from './errors';
import { DEFAULT_JSON_BODY_LIMIT_BYTES, readBoundedJsonBody } from './requestBody';
import { d7NumberField } from './d7Number';
import {
  sanitizeComplaintSlots,
  sanitizeIdentifier,
  sanitizeText,
  sanitizeTextArray,
  sanitizeVin,
} from './sanitize';

const safeText = (max: number) => z.string().max(max).transform(sanitizeText);
const safeTextOptional = (max: number) => z.string().max(max).transform(sanitizeText).optional();
const safeId = (max: number) => z.string().max(max).transform(sanitizeIdentifier);
const safeIdOptional = (max: number) => z.string().max(max).transform(sanitizeIdentifier).optional();

export const loginSchema = z.object({
  d7Number: d7NumberField,
  password: z.string().min(1).max(128),
});

export const vinSchema = z.object({
  vin: z.string().trim().min(11).max(17).transform(sanitizeVin),
});

export const imagePathnamesSchema = z.object({
  imagePathnames: z
    .array(z.string().min(3).max(512).transform(sanitizeIdentifier))
    .min(1)
    .max(10),
});

const imageAttachmentSchema = z
  .object({
    id: z.string().max(64).transform(sanitizeIdentifier),
    pathname: z.string().min(3).max(512).transform(sanitizeIdentifier).optional(),
    url: z.string().min(1).max(512).optional(),
    name: z.string().max(255).transform(sanitizeText),
  })
  .refine((img) => Boolean(img.pathname || img.url), {
    message: 'Image attachment requires pathname or url',
  });

const vehicleSchema = z.object({
  vin: z.string().max(17).transform(sanitizeVin).optional(),
  year: safeTextOptional(10),
  make: safeTextOptional(64),
  model: safeTextOptional(64),
  engine: safeTextOptional(64),
  mileageIn: safeTextOptional(16),
  mileageOut: safeTextOptional(16),
});

const faultCodeSchema = z.object({
  code: safeText(32),
  description: safeText(500),
  status: safeText(32).optional(),
});

const extractedDataSchema = z.object({
  codes: z.array(safeText(128)).optional(),
  faultCodes: z.array(faultCodeSchema).max(30).optional(),
  guidedTests: z.array(safeText(2000)).optional(),
  measurements: z
    .array(
      z.object({
        label: safeText(200),
        value: safeText(200),
      })
    )
    .optional(),
  components: z.array(safeText(500)).optional(),
  circuits: z.array(safeText(500)).optional(),
});

const repairLineSchema = z.object({
  id: safeIdOptional(64),
  lineNumber: z.number().int().positive().optional(),
  description: safeTextOptional(500),
  customerConcern: safeTextOptional(2000),
  technicianNotes: safeTextOptional(10000),
  xentryImages: z.array(imageAttachmentSchema).max(20).optional(),
  xentryOcrTexts: z.array(safeText(50000)).max(20).optional(),
  extractedData: extractedDataSchema.optional(),
  warrantyStory: safeTextOptional(5000),
  /** Sticky Customer Pay flag — preserved on RO save when omitted from client payload. */
  isCustomerPay: z.boolean().optional(),
  /** M1: Explicit intent to clear Customer Pay mode (isCustomerPay: false alone is ignored). */
  clearCustomerPay: z.boolean().optional(),
  /** Explicit intent to clear a persisted MI audit result on save. */
  clearStoryQualityAudit: z.boolean().optional(),
});

const advisorExtractionSourceSchema = z.enum(['grok', 'ocr_fallback', 'manual']);

export const createRepairOrderSchema = z.object({
  fromExtraction: z.boolean().optional(),
  roNumber: safeIdOptional(32),
  vehicle: vehicleSchema.optional(),
  customer: z.object({ name: safeTextOptional(200) }).optional(),
  customerName: safeTextOptional(200),
  serviceAdvisorName: safeTextOptional(48),
  advisorExtractionSource: advisorExtractionSourceSchema.optional(),
  complaints: z.array(safeText(2000)).max(20).transform(sanitizeComplaintSlots).optional(),
  complaintLabels: z.array(safeText(4)).max(20).optional(),
  xentryImages: z.array(imageAttachmentSchema).max(20).optional(),
  xentryOcrTexts: z.array(safeText(50000)).max(20).optional(),
  repairLines: z.array(repairLineSchema).max(50).optional(),
});

export const updateRepairOrderSchema = z.object({
  /** Optimistic concurrency — when provided, must match the server row updatedAt. */
  updatedAt: z.string().datetime().optional(),
  roNumber: safeIdOptional(32),
  vehicle: vehicleSchema.optional(),
  customer: z.object({ name: safeTextOptional(200) }).optional(),
  serviceAdvisorName: safeTextOptional(48),
  advisorExtractionSource: advisorExtractionSourceSchema.optional(),
  complaintsWereCorrected: z.boolean().optional(),
  complaints: z.array(safeText(2000)).max(20).transform(sanitizeComplaintSlots).optional(),
  complaintLabels: z.array(safeText(4)).max(20).optional(),
  xentryImages: z.array(imageAttachmentSchema).max(20).optional(),
  xentryOcrTexts: z.array(safeText(50000)).max(20).optional(),
  repairLines: z.array(repairLineSchema).max(50).optional(),
});

export const resolveAdvisorSchema = z.object({
  serviceAdvisorName: safeText(48),
});

export type ServiceAdvisorLinkMode = 'existing' | 'create';

export function resolveServiceAdvisorLinkMode(input: {
  role: 'technician' | 'manager' | 'service_advisor';
  serviceAdvisorLinkMode?: ServiceAdvisorLinkMode;
  serviceAdvisorId?: string;
}): ServiceAdvisorLinkMode | null {
  if (input.role !== 'service_advisor') return null;
  if (input.serviceAdvisorLinkMode) return input.serviceAdvisorLinkMode;
  return input.serviceAdvisorId?.trim() ? 'existing' : 'create';
}

export const createUserSchema = z
  .object({
    d7Number: d7NumberField,
    name: safeText(100),
    password: z.string().min(8).max(128),
    role: z.enum(['technician', 'manager', 'service_advisor']).default('technician'),
    serviceAdvisorLinkMode: z.enum(['existing', 'create']).optional(),
    serviceAdvisorId: safeIdOptional(64),
    newAdvisorDisplayName: safeTextOptional(48),
    newAdvisorCode: safeTextOptional(16),
  })
  .superRefine((data, ctx) => {
    if (data.role !== 'service_advisor') return;

    const mode = resolveServiceAdvisorLinkMode(data);
    if (mode === 'existing') {
      if (!data.serviceAdvisorId?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select a service advisor profile to link',
          path: ['serviceAdvisorId'],
        });
      }
      return;
    }

    const displayName = data.newAdvisorDisplayName?.trim() ?? '';
    if (displayName.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the advisor name (at least 3 characters)',
        path: ['newAdvisorDisplayName'],
      });
    }
  });

export const soldMetricsSchema = z.object({
  soldLaborHours: z.number().min(0).max(999).nullable().optional(),
  soldLaborAmount: z.number().min(0).max(1_000_000).nullable().optional(),
  soldPartsAmount: z.number().min(0).max(1_000_000).nullable().optional(),
  customerApproved: z.boolean().nullable().optional(),
  isAddOn: z.boolean().nullable().optional(),
});

export const updateUserSchema = z.object({
  isActive: z.boolean(),
});

export const createAdvisorSchema = z.object({
  displayName: safeText(48),
  advisorCode: safeTextOptional(16),
});

export const updateAdvisorSchema = z.object({
  status: z.enum(['active', 'inactive']),
  csiScore: z.number().min(0).max(100).nullable().optional(),
});

export const storyEditSchema = z.object({
  warrantyStory: safeText(5000),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

export const reviewStorySchema = z.object({
  warrantyStory: safeText(5000),
});

export const certifyStorySchema = z.object({
  warrantyStory: safeText(5000),
  certifiedByName: safeText(100).refine((value) => value.trim().length >= 2, {
    message: 'Technician full name is required',
  }),
});

export const saveTemplateFromStorySchema = z.object({
  title: safeText(120),
  category: z.enum(['customer', 'warranty']),
  finalText: safeText(5000),
  generatedText: safeText(5000),
  lineDescription: safeTextOptional(500),
  vehicleMake: safeTextOptional(64),
  vehicleModel: safeTextOptional(64),
  codes: z.array(safeText(32)).max(20).optional(),
  repairOrderId: safeIdOptional(64),
  lineId: safeIdOptional(64),
});

export const applyCustomerPayTemplateSchema = z.object({
  templateId: safeId(64),
});

export const pdfExportAuditSchema = z.object({
  repairLineId: safeId(64),
  repairOrderId: safeId(64),
  durationMs: z.number().int().min(0).max(600_000).optional(),
});

export const technicianAppStartLogSchema = z.object({
  clientSessionId: z.string().min(8).max(64),
  metadata: z
    .object({
      role: z.enum(['technician', 'manager', 'service_advisor']).optional(),
      todayRoCount: z.number().int().min(0).max(10_000).optional(),
      previousRoCount: z.number().int().min(0).max(10_000).optional(),
      appVersion: z.string().max(32).optional(),
    })
    .optional(),
});

export const technicianLogQuerySchema = z.object({
  category: z.enum(['app_start', 'story']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const auditLogQuerySchema = z.object({
  technicianId: safeIdOptional(64),
  action: safeIdOptional(64),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

/** Compact cap for unauthenticated auth bootstrap bodies (login). */
export const AUTH_JSON_BODY_LIMIT_BYTES = 16_384;

export const entityIdSchema = z
  .string()
  .min(1)
  .max(64)
  .transform(sanitizeIdentifier)
  .refine((value) => value.length > 0, { message: 'Invalid id' });

export const routeIdParamsSchema = z.object({
  id: entityIdSchema,
});

export const repairOrderLineParamsSchema = z.object({
  id: entityIdSchema,
  lineId: entityIdSchema,
});

export const imagePathnameQuerySchema = z.object({
  pathname: z.string().min(3).max(512).transform(sanitizeIdentifier),
});

export const templateListQuerySchema = z.object({
  category: z.enum(['customer', 'warranty']).optional(),
});

export const knowledgeBaseListQuerySchema = z.object({
  category: z.enum(['customer', 'warranty']).optional(),
});

export const auditLatestQuerySchema = z.object({
  repairLineId: entityIdSchema,
});

export const repairOrderListQuerySchema = z.object({
  scope: z.enum(['today', 'previous']).default('today'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: safeIdOptional(64),
  q: z.string().max(120).transform(sanitizeText).optional(),
});

export const technicianStoriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(80).optional(),
});

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return { data: result.data };
}

/** Bounded JSON read + Zod parse + sanitization — standard path for POST API bodies. */
export async function parseRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>,
  maxBytes: number = DEFAULT_JSON_BODY_LIMIT_BYTES
): Promise<{ data: T } | { error: NextResponse }> {
  const raw = await readBoundedJsonBody(request, maxBytes);
  if ('error' in raw) return raw;
  const parsed = parseBody(schema, raw.body);
  if ('error' in parsed) {
    return { error: apiError(VALIDATION_ERROR, 400) };
  }
  return { data: parsed.data };
}

export function parseQueryParams<S extends z.ZodTypeAny>(
  request: Request,
  schema: S
): { data: z.output<S> } | { error: NextResponse } {
  const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: apiError(VALIDATION_ERROR, 400) };
  }
  return { data: parsed.data };
}

export async function parseRouteParams<S extends z.ZodTypeAny>(
  schema: S,
  params: Promise<unknown>
): Promise<{ data: z.output<S> } | { error: NextResponse }> {
  const raw = await params;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: apiError(VALIDATION_ERROR, 400) };
  }
  return { data: parsed.data };
}