import { z } from 'zod';

export const TrackingEventSchema = z.object({
  date: z.string(),
  location: z.string(),
  event: z.string(),
  reason: z.string().optional(),
});

export type TrackingEvent = z.infer<typeof TrackingEventSchema>;

export const PackageSchema = z.object({
  pieceId: z.string().optional(),
  weight: z.number().optional(),
  dimensions: z.string().optional(),
  trackingEvents: z.array(TrackingEventSchema).optional(),
});

export const ShipmentSchema = z.object({
  reference: z.string(),
  sender: z.object({ address: z.string() }),
  receiver: z.object({ address: z.string() }),
  packages: z.array(PackageSchema),
  trackingHistory: z.array(TrackingEventSchema),
});

export type ShipmentData = z.infer<typeof ShipmentSchema>;

export default ShipmentSchema;

