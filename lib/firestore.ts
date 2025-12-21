import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  writeBatch,
} from "firebase/firestore"
import { getFirebaseDb } from "./firebase"
import type { Project, Task, ChatMessage, ProjectMember } from "./types"

function getDb() {
  const db = getFirebaseDb()
  if (!db) throw new Error("Database not available")
  return db
}

// Generate random join code
function generateJoinCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]).catch(
    () => fallback,
  )
}

// Projects
export async function createProject(name: string, duration: "24h" | "48h", userId: string): Promise<string> {
  const db = getDb()
  const projectRef = doc(collection(db, "projects"))

  const project = {
    project_id: projectRef.id,
    name,
    duration,
    created_by: userId,
    members: [userId],
    join_code: generateJoinCode(),
    demo_mode: false,
    created_at: serverTimestamp(),
  }

  await setDoc(projectRef, project)

  // Set role in background - don't wait
  setDoc(doc(db, "project_roles", `${projectRef.id}_${userId}`), {
    project_id: projectRef.id,
    user_id: userId,
    role: "admin",
  }).catch(() => {})

  return projectRef.id
}

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const db = getDb()
    const projectDoc = await withTimeout(getDoc(doc(db, "projects", projectId)), 3000, null as any)
    if (!projectDoc || !projectDoc.exists?.()) return null
    const data = projectDoc.data()
    return {
      ...data,
      created_at: data.created_at?.toDate?.() || new Date(),
    } as Project
  } catch (error) {
    console.error("Error getting project:", error)
    return null
  }
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  try {
    const db = getDb()
    const q = query(collection(db, "projects"), where("members", "array-contains", userId))
    const snapshot = await withTimeout(getDocs(q), 3000, { docs: [] } as any)

    if (!snapshot.docs) return []

    const projects = snapshot.docs.map((doc: any) => {
      const data = doc.data()
      return {
        ...data,
        created_at: data.created_at?.toDate?.() || new Date(),
      } as Project
    })

    return projects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } catch (error) {
    console.error("Error getting user projects:", error)
    return []
  }
}

export async function joinProjectByCode(joinCode: string, userId: string): Promise<string | null> {
  try {
    const db = getDb()
    const q = query(collection(db, "projects"), where("join_code", "==", joinCode))
    const snapshot = await withTimeout(getDocs(q), 5000, { empty: true, docs: [] } as any)
    if (snapshot.empty || !snapshot.docs?.length) return null

    const projectDoc = snapshot.docs[0]
    const batch = writeBatch(db)

    batch.update(doc(db, "projects", projectDoc.id), {
      members: arrayUnion(userId),
    })

    batch.set(doc(db, "project_roles", `${projectDoc.id}_${userId}`), {
      project_id: projectDoc.id,
      user_id: userId,
      role: "member",
    })

    await batch.commit()

    return projectDoc.id
  } catch (error) {
    console.error("Error joining project:", error)
    throw error
  }
}

export async function updateProjectIdea(projectId: string, idea: Project["idea"]): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), { idea })
}

export async function toggleDemoMode(projectId: string, enabled: boolean): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), { demo_mode: enabled })
}

export async function updateDemoMode(projectId: string, enabled: boolean): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), { demo_mode: enabled })
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)

  // Delete all tasks
  try {
    const tasksQuery = query(collection(db, "tasks"), where("project_id", "==", projectId))
    const tasksSnapshot = await getDocs(tasksQuery)
    tasksSnapshot.docs.forEach((taskDoc) => {
      batch.delete(taskDoc.ref)
    })
  } catch (e) {
    console.error("Error deleting tasks:", e)
  }

  // Delete all chat messages
  try {
    const messagesQuery = query(collection(db, "messages"), where("project_id", "==", projectId))
    const messagesSnapshot = await getDocs(messagesQuery)
    messagesSnapshot.docs.forEach((msgDoc) => {
      batch.delete(msgDoc.ref)
    })
  } catch (e) {
    console.error("Error deleting messages:", e)
  }

  // Delete project
  batch.delete(doc(db, "projects", projectId))

  await batch.commit()
}

// Subscribe to project updates with error handling
export function subscribeToProject(projectId: string, callback: (project: Project | null) => void) {
  try {
    const db = getDb()
    return onSnapshot(
      doc(db, "projects", projectId),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data()
          callback({
            ...data,
            created_at: data.created_at?.toDate?.() || new Date(),
          } as Project)
        } else {
          callback(null)
        }
      },
      (error) => {
        console.error("Error subscribing to project:", error)
        callback(null)
      },
    )
  } catch {
    callback(null)
    return () => {}
  }
}

// Tasks
export async function createTask(task: Omit<Task, "task_id" | "last_updated">): Promise<string> {
  const db = getDb()
  const taskRef = doc(collection(db, "tasks"))
  await setDoc(taskRef, {
    ...task,
    task_id: taskRef.id,
    last_updated: serverTimestamp(),
  })
  return taskRef.id
}

export async function addTask(task: Omit<Task, "task_id" | "last_updated">): Promise<Task | null> {
  try {
    const db = getDb()
    const taskRef = doc(collection(db, "tasks"))
    const newTask = {
      ...task,
      task_id: taskRef.id,
      last_updated: new Date(),
    }
    await setDoc(taskRef, {
      ...task,
      task_id: taskRef.id,
      last_updated: serverTimestamp(),
    })
    return newTask as Task
  } catch (error) {
    console.error("Error adding task:", error)
    return null
  }
}

export async function createTasks(tasks: Omit<Task, "task_id" | "last_updated">[]): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)

  for (const task of tasks) {
    const taskRef = doc(collection(db, "tasks"))
    batch.set(taskRef, {
      ...task,
      task_id: taskRef.id,
      last_updated: serverTimestamp(),
    })
  }

  await batch.commit()
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "tasks", taskId), {
    ...updates,
    last_updated: serverTimestamp(),
  })
}

export async function deleteTask(taskId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, "tasks", taskId))
}

export function subscribeToTasks(projectId: string, callback: (tasks: Task[]) => void) {
  try {
    const db = getDb()
    const q = query(collection(db, "tasks"), where("project_id", "==", projectId))
    return onSnapshot(
      q,
      (snapshot) => {
        const tasks = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            ...data,
            last_updated: data.last_updated?.toDate?.() || new Date(),
          } as Task
        })
        tasks.sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime())
        callback(tasks)
      },
      (error) => {
        console.error("Error subscribing to tasks:", error)
        callback([])
      },
    )
  } catch {
    callback([])
    return () => {}
  }
}

// Chat Messages
export async function sendMessage(message: Omit<ChatMessage, "message_id" | "timestamp">): Promise<string> {
  const db = getDb()
  const msgRef = doc(collection(db, "messages"))
  await setDoc(msgRef, {
    ...message,
    message_id: msgRef.id,
    timestamp: serverTimestamp(),
  })
  return msgRef.id
}

export function subscribeToMessages(projectId: string, callback: (messages: ChatMessage[]) => void) {
  try {
    const db = getDb()
    const q = query(collection(db, "messages"), where("project_id", "==", projectId))
    return onSnapshot(
      q,
      (snapshot) => {
        const messages = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            ...data,
            timestamp: data.timestamp?.toDate?.() || new Date(),
          } as ChatMessage
        })
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        callback(messages)
      },
      (error) => {
        console.error("Error subscribing to messages:", error)
        callback([])
      },
    )
  } catch {
    callback([])
    return () => {}
  }
}

// Project Members
export async function getProjectMembers(memberIds: string[]): Promise<ProjectMember[]> {
  try {
    const db = getDb()
    const members: ProjectMember[] = []
    for (const id of memberIds) {
      try {
        const userDoc = await getDoc(doc(db, "users", id))
        if (userDoc.exists()) {
          members.push(userDoc.data() as ProjectMember)
        }
      } catch (e) {
        console.error("Error getting member:", e)
      }
    }
    return members
  } catch {
    return []
  }
}

export async function getUserRole(projectId: string, userId: string): Promise<"admin" | "member" | "viewer"> {
  try {
    const db = getDb()
    const roleDoc = await getDoc(doc(db, "project_roles", `${projectId}_${userId}`))
    if (roleDoc.exists()) {
      return roleDoc.data().role
    }
  } catch (e) {
    console.error("Error getting user role:", e)
  }
  return "viewer"
}

export function subscribeToProjectMembers(memberIds: string[], callback: (members: ProjectMember[]) => void) {
  try {
    const db = getDb()
    const unsubscribes: (() => void)[] = []
    const membersMap = new Map<string, ProjectMember>()

    memberIds.forEach((id) => {
      const unsub = onSnapshot(
        doc(db, "users", id),
        (doc) => {
          if (doc.exists()) {
            membersMap.set(id, doc.data() as ProjectMember)
            callback(Array.from(membersMap.values()))
          }
        },
        (error) => {
          console.error("Error subscribing to member:", error)
        },
      )
      unsubscribes.push(unsub)
    })

    return () => unsubscribes.forEach((unsub) => unsub())
  } catch {
    callback([])
    return () => {}
  }
}
