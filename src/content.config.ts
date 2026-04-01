import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const regulations = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/regulations' }),
  schema: z.object({
    title: z.string(),
    nomor: z.string(),
    jenis: z.enum(['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'KMK']),
    tahun: z.number(),
    tanggal_diundangkan: z.string(),
    tanggal_berlaku: z.string(),
    status: z.enum(['berlaku', 'dicabut', 'diubah']),
    mencabut: z.array(z.string()).optional(),
    dicabut_oleh: z.string().nullable().optional(),
    mengubah: z.string().nullable().optional(),
    diubah_oleh: z.array(z.string()).optional(),
    topik: z.array(z.string()),
    sektor: z.array(z.string()).optional(),
    dasar_hukum: z.string().nullable().optional(),
    berlaku_untuk: z.array(z.string()).optional(),
    ringkasan: z.string(),
    sumber_pdf: z.string().optional(),
    // Phase 2: Hybrid content fields
    bentuk: z.enum(['1', '2', '3', '4']).optional(),
    lampiran_images: z.array(z.object({
      halaman: z.number(),
      file: z.string(),
      caption: z.string(),
      ocr_text: z.string().optional(),
    })).optional(),
  }),
});

export const collections = { regulations };
