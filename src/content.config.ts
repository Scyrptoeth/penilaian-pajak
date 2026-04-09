import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const regulations = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/regulations' }),
  schema: z.object({
    title: z.string(),
    nomor: z.string(),
    jenis: z.enum(['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'KMK', 'KEPPRES']),
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
    // Google Drive lampiran PDF
    lampiran_pdf: z.string().optional(),
    // Ortax metadata
    ortax_id: z.string().optional(),
  }),
});

// DDTC-style lampiran info item
const lampiranInfoItem = z.object({
  uuid: z.string(),
  file_path: z.string(),
  file_title: z.string(),
});

// Related regulation reference
const relatedRegRef = z.object({
  title: z.string(),
  prefix: z.string(),
  slug: z.string(),
});

const regulationsPendukung = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/regulations-pendukung' }),
  schema: z.object({
    title: z.string(),
    nomor: z.string(),
    jenis: z.enum(['UU', 'PP', 'PMK', 'PER', 'SE', 'KEP', 'KMK', 'KEPPRES', 'PBM', 'SDIRJEN', 'KEBDJ', 'INSTRUKSI', 'PENGUMUMAN', 'PERPRES']),
    tahun: z.number(),
    tanggal_berlaku: z.string(),
    deskripsi: z.string(),
    status: z.enum(['berlaku', 'dicabut', 'diubah']),
    status_label: z.string().optional(),
    status_color: z.enum(['green', 'red', 'blue']),
    topik: z.array(z.string()).optional(),
    slug_ddtc: z.string().optional(),
    sumber_ddtc: z.string().optional(),
    // Google Drive PDF links
    pdf_isi: z.string().optional(),
    pdf_lampiran: z.string().optional(),
    // DDTC-style metadata
    lampiran_info: z.array(lampiranInfoItem).optional(),
    peraturan_terkait_terbaru: z.array(relatedRegRef).optional(),
    peraturan_terkait_sebelumnya: z.array(relatedRegRef).optional(),
    riwayat: z.array(z.string()).optional(),
    analisis: z.array(z.string()).optional(),
  }),
});

export const collections = { regulations, 'regulations-pendukung': regulationsPendukung };
