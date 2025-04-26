export interface CanvasConfig {
  apiToken: string;
  baseUrl: string;
}

export interface Term {
  id: number;
  name: string;
  start_at?: string;
  end_at?: string;
}

export interface Course {
  id: number;
  name: string;
  course_code: string;
  workflow_state: string;
  term?: Term;
}

export interface Rubric {
  id: string;
  title: string;
  description?: string;
}

export interface Announcement {
    id: number;
    title: string;
    message?: string; // HTML content
    url?: string;
    posted_at?: string; // ISO 8601 timestamp
    context_code: string; // e.g., "course_123"
    author?: { // Author details might be included
        id: number;
        display_name: string;
        avatar_image_url?: string;
    };
    // Add other relevant fields as needed
}

export interface CourseFile {
  id: number; // Usually number ID from Canvas
  uuid?: string;
  folder_id?: number;
  display_name: string;
  filename: string;
  content_type: string;
  url: string;
  size: number;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  modified_at?: string; // ISO 8601
  locked?: boolean;
  hidden?: boolean;
  lock_at?: string | null; // ISO 8601
  unlock_at?: string | null; // ISO 8601
  hidden_for_user?: boolean;
  thumbnail_url?: string | null;
  mime_class?: string;
  media_entry_id?: string | null;
  locked_for_user?: boolean;
  lock_info?: any; // Could be more specific if needed
  lock_explanation?: string;
  preview_url?: string | null;
}

export interface TodoItem {
  type: string;
  assignment?: {
    id: number; // Changed to number
    name: string;
    due_at: string;
    points_possible: number;
    course_id: number; // Changed to number
  };
  context_name: string;
  course_id?: number; // Changed to number
  html_url: string;
  ignore_url?: string;
  title?: string;
  needs_grading_count?: number;
  quiz?: { id: number; }; // Added based on potential API response
  discussion_topic?: { id: number; }; // Added based on potential API response
}

export interface Assignment {
  id: number; // Changed to number
  name: string;
  description?: string; // Optional
  due_at: string | null;
  points_possible: number | null; // Can be null
  submission?: {
    submitted_at: string | null;
    score: number | null;
    grade: string | null;
    late: boolean;
    missing: boolean;
    submission_comments?: any[]; // Array for comments
  };
  html_url: string;
  course_id: number; // Changed to number
  course_name?: string; // Added for convenience
}

export interface CourseGrade {
  course_id: number; // Changed to number
  course_name: string;
  current_grade: string | null;
  current_score: number | null;
  final_grade: string | null;
  final_score: number | null;
  html_url: string;
}

export interface Module {
  id: number; // Changed to number
  name: string;
  position: number;
  items_url: string; // URL to fetch items
  items_count: number;
  state?: 'locked' | 'unlocked' | 'started' | 'completed';
  completed_at?: string | null;
  // Add other relevant fields
}

export interface ModuleItem {
  id: number; // Changed to number
  module_id: number;
  position: number;
  title: string;
  indent?: number;
  type: 'File' | 'Page' | 'Discussion' | 'Assignment' | 'Quiz' | 'SubHeader' | 'ExternalUrl' | 'ExternalTool';
  content_id?: number;
  html_url?: string;
  url?: string; // For ExternalUrl type
  page_url?: string; // For Page type
  external_url?: string; // For ExternalUrl type
  new_tab?: boolean;
  completion_requirement?: {
    type: 'must_view' | 'must_submit' | 'must_contribute' | 'min_score' | 'must_mark_done';
    min_score?: number;
    completed: boolean;
  };
  published?: boolean;
  // Add other relevant fields
}

export interface DiscussionTopic {
  id: number; // Changed to number
  title: string;
  message?: string; // HTML content
  posted_at?: string; // ISO 8601
  last_reply_at?: string; // ISO 8601
  author?: any; // Simplified author info
  unread_count?: number;
  read_state?: 'read' | 'unread';
  html_url: string;
  course_id?: number; // Changed to number
  // Add other relevant fields
}

export interface DiscussionEntry {
  id: number; // Changed to number
  user_id: number;
  user_name: string;
  message?: string; // HTML content
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  replies?: DiscussionEntry[];
  // Add other relevant fields
}

export interface QuizSubmission {
  id: number; // Changed to number
  quiz_id: number; // Changed to number
  user_id: number; // Changed to number
  submission_id: number; // Changed to number
  attempt: number;
  workflow_state: 'untaken' | 'pending_review' | 'complete' | 'settings_only' | 'preview';
  score?: number | null; // Optional score, can be null
  kept_score?: number | null; // Score kept if multiple attempts allowed, can be null
  started_at?: string | null; // ISO 8601 timestamp, can be null
  finished_at?: string | null; // ISO 8601 timestamp, can be null
  end_at?: string | null; // ISO 8601 timestamp, can be null
  time_spent?: number | null; // Seconds, can be null
  html_url?: string;
  // Add other relevant fields as needed
}

export interface Page {
  page_id: number;
  url: string; // Unique URL identifier for the page
  title: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  editing_roles?: string;
  last_edited_by?: {
    id: number;
    display_name: string;
    avatar_image_url: string;
    html_url: string;
  };
  published: boolean;
  hide_from_students: boolean;
  front_page: boolean;
  html_url: string; // URL to view the page in the browser
  body?: string; // HTML content of the page (only included when fetching a single page)
  // Add other relevant fields as needed
}