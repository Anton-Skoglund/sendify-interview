import type { ShipmentData } from './types';
import { ShipmentSchema } from './types';
import { z } from 'zod';

type ShipmentFromZod = z.infer<typeof ShipmentSchema>;

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

type Assert<T extends true> = T;

type ShipmentTypesMatch = Assert<IsExact<ShipmentFromZod, ShipmentData>>;
