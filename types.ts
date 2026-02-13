
export type ActivityType = '활동';

export type ViewMode = 'main' | 'playground' | 'recent';

export interface Student {
  id: string;
  name: string;
  number: number;
}

export interface ClassGroup {
  id: string;
  name: string;
  students: Student[];
}

export interface ActivityRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: number;
  classId: string;
  className: string;
  type: ActivityType;
  content: string;
  aiPolishedContent?: string;
  timestamp: number;
}

export interface AppState {
  classes: ClassGroup[];
  records: ActivityRecord[];
  activeClassId: string | null;
  activeTab: 'home' | 'playground' | 'archive';
}
