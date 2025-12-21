export interface Project {
  project_id: string
  name: string
  duration: "24h" | "48h"
  created_by: string
  members: string[]
  join_code: string
  demo_mode: boolean
  idea?: IdeaAnalysis
  created_at: Date
}

export interface Task {
  task_id: string
  project_id: string
  title: string
  description: string
  effort: "Low" | "Medium" | "High"
  status: "ToDo" | "InProgress" | "Done"
  assigned_to: string | null
  last_updated: Date
}

export interface ChatMessage {
  message_id: string
  project_id: string
  sender: string
  sender_type: "user" | "ai"
  content: string
  timestamp: Date
}

export interface IdeaAnalysis {
  problem_statement: string
  target_users: string[]
  features: string[]
  risks: string[]
  tech_stack_suggestions: string[]
}

export interface ProjectMember {
  user_id: string
  name: string
  email: string
  role: "admin" | "member" | "viewer"
  skills: string[]
  online_status: boolean
}
