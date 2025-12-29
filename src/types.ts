interface TrackingEvent {
  date: string;
  location: string;
  event: string;
  reason?: string;
}

interface ShipmentData {
  reference: string;
  sender: { name: string; address: string; };
  receiver: { name: string; address: string; };
  packages: Array<{
    pieceId?: string;
    weight?: number;
    dimensions?: string;
    trackingEvents?: TrackingEvent[];
  }>;
  trackingHistory: TrackingEvent[];
}
