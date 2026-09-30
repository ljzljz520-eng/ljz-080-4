export type MachineType = 'excavator' | 'crane' | 'roller'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type OrderStatus = 'assigned' | 'accepted' | 'enroute' | 'arrived' | 'completed' | 'confirmed' | 'rework'

export interface Site { id: string; name: string; contact: string; phone: string; address: string; lat: number; lng: number }
export interface Machine {
  id: string; code: string; brand: string; type: MachineType; siteId: string
  hours: number; lastMaintHours: number; faultCodes: string[]; online: boolean
  lat: number; lng: number; updatedAt: number
  site?: Site; activeOrderId?: string | null
  assessment?: Assessment | null
}
export interface AssessmentReason { codes: string[]; overdueHours: number; elapsed: number; details: { kind: string; text: string }[] }
export interface Assessment {
  type: 'fault' | 'maintenance'; level: 'small' | 'medium' | 'major' | null
  title: string; reason: AssessmentReason
  fault?: (FaultCode & { code: string }) | null
  maintenance?: MaintRule | null
}
export interface FaultCode { label: string; severity: Severity; types: MachineType[]; advice: string }
export interface MaintRule { level: string; interval: number; name: string; items: string }
export interface Technician {
  id: string; name: string; phone: string; skills: MachineType[]
  lat: number; lng: number; online: boolean; completedToday: number; activeOrder?: string | null
}
export interface Candidate { technicianId: string; name: string; phone: string; distanceKm: number; score: number; online: boolean; reason: string }
export interface TimelineItem { t: number; event: string; label: string }
export interface Part { id?: string; name: string; spec?: string; qty: number; unit?: string }
export interface Photo { url?: string; dataUrl?: string; caption?: string; takenAt?: number }
export interface Report {
  diagnosis: string; workDone: string; parts: Part[]; downtimeMin: number
  recovered: boolean; photos: { url: string; caption: string; takenAt: number }[]
  clientNote?: string; completedAt: number
}
export interface Order {
  id: string; code: string; machineId: string; siteId: string
  type: 'fault' | 'maintenance'; level: string | null; title: string
  reason: AssessmentReason; status: OrderStatus; technicianId: string
  createdAt: number; assignedAt: number; acceptedAt?: number | null; enrouteAt?: number | null
  arrivedAt?: number | null
  candidates: Candidate[]; report: Report | null
  confirmation: { recovered: boolean; contactName: string; note: string; confirmedAt: number } | null
  timeline: TimelineItem[]
  machine?: Machine; site?: Site; technician?: Technician
}
export interface Overview {
  counts: Record<string, number>
  needDispatch: { id: string; code: string; brand: string; type: MachineType; siteName: string; title: string; faultSeverity: Severity | null; overdueHours: number }[]
  pendingConfirm: { id: string; code: string; machineCode: string; siteName: string; technicianName: string; completedAt: number }[]
  idleTech: { id: string; name: string; skills: MachineType[] }[]
}
export interface PartCatalogItem { id: string; name: string; spec: string; unit: string }
export interface Meta { machineTypes: Record<MachineType, { label: string; short: string; color: string }>; faultCodes: Record<string, FaultCode>; maintRules: Record<MachineType, MaintRule[]> }
