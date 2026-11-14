import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const artifacts = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/artifacts' }),
  schema: ({ image }) =>
    z.object({
      id: z.string(),
      name: z.string(),
      nssdcId: z.string(),
      agency: z.string(),
      body: z.enum(['mars', 'moon']),
      type: z.enum(['rover', 'lander', 'helicopter', 'instrument-station', 'other']),
      launchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      lastContactDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      site: z.object({
        name: z.string(),
        lat: z.union([z.number().min(-90).max(90), z.literal('pending')]),
        lon: z.union([z.number().min(-180).max(180), z.literal('pending')]),
        description: z.string(),
      }),
      endCause: z.string(),
      scientificValue: z.string(),
      legacy: z
        .array(
          z.object({
            finding: z.string(),
            sourceTitle: z.string(),
            sourceUrl: z.url(),
          }),
        )
        .min(1)
        .max(3),
      verification: z.enum(['verified', 'pending']),
      verificationNote: z.string().optional(),
      sources: z
        .array(
          z.object({
            title: z.string(),
            url: z.url(),
            accessedDate: z.string(),
          }),
        )
        .min(1),
      image: z
        .object({
          file: image(),
          alt: z.string(),
          credit: z.string(),
          originalUrl: z.url(),
        })
        .optional(),
      featured: z.boolean(),
    }),
});

export const collections = {
  artifacts,
};
