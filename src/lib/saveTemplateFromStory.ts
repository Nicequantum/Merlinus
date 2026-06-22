import {
  encryptOptionalSensitiveText,
  encryptSensitiveText,
} from '@/lib/encryption';
import { prisma } from '@/lib/db';
import { buildTemplateTags } from '@/lib/templateTags';
import { GLOBAL_DEALERSHIP_ID, mapKnowledgeBase, mapTemplate } from '@/lib/templateLibrary';

export interface SaveTemplateFromStoryInput {
  title: string;
  category: 'customer' | 'warranty';
  finalText: string;
  generatedText: string;
  dealershipId: string;
  createdById: string;
  lineDescription?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  codes?: string[];
}

export async function saveTemplateFromStory(input: SaveTemplateFromStoryInput) {
  const tags = buildTemplateTags(input);
  const tagsJson = JSON.stringify(tags);
  const now = new Date();

  const template = await prisma.template.upsert({
    where: {
      dealershipId_title: {
        dealershipId: input.dealershipId,
        title: input.title,
      },
    },
    update: {
      category: input.category,
      contentEncrypted: encryptSensitiveText(input.finalText),
      source: 'user',
      updatedAt: now,
    },
    create: {
      title: input.title,
      category: input.category,
      contentEncrypted: encryptSensitiveText(input.finalText),
      source: 'user',
      dealershipId: input.dealershipId,
      createdById: input.createdById,
    },
  });

  const knowledgeBase = await prisma.knowledgeBase.upsert({
    where: {
      dealershipId_title: {
        dealershipId: input.dealershipId,
        title: input.title,
      },
    },
    update: {
      category: input.category,
      generatedTextEncrypted: encryptOptionalSensitiveText(input.generatedText),
      fullOriginalTextEncrypted: encryptSensitiveText(input.finalText),
      cleanTemplateEncrypted: encryptSensitiveText(input.finalText),
      tags: tagsJson,
      source: 'user',
      updatedAt: now,
    },
    create: {
      title: input.title,
      category: input.category,
      generatedTextEncrypted: encryptOptionalSensitiveText(input.generatedText),
      fullOriginalTextEncrypted: encryptSensitiveText(input.finalText),
      cleanTemplateEncrypted: encryptSensitiveText(input.finalText),
      tags: tagsJson,
      source: 'user',
      dealershipId: input.dealershipId,
    },
  });

  return {
    template: mapTemplate(template),
    knowledgeBase: mapKnowledgeBase(knowledgeBase),
    tags,
  };
}

export function templatesForDealershipWhere(dealershipId: string) {
  return {
    OR: [{ dealershipId: GLOBAL_DEALERSHIP_ID }, { dealershipId, source: 'user' }],
  };
}