// ── Users ────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: "student" | "admin"
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

// ── Instructors ──────────────────────────────────────────
export interface Instructor {
  id: string
  name: string
  slug: string
  bio: string
  photoUrl: string | null
  specialties: string[]
  createdAt: string
}

// ── Courses ──────────────────────────────────────────────
export interface Course {
  id: string
  title: string
  slug: string
  shortDescription: string
  longDescription: string
  category: string
  priceInCents: number
  thumbnailUrl: string | null
  instructorId: string
  instructor?: Instructor
  modules?: Module[]
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface Module {
  id: string
  courseId: string
  title: string
  sortOrder: number
  lessons?: Lesson[]
}

export interface Lesson {
  id: string
  moduleId: string
  title: string
  bunnyVideoId: string | null
  durationSeconds: number
  sortOrder: number
  isFreePreview: boolean
}

// ── Enrollments & Progress ───────────────────────────────
export interface Enrollment {
  id: string
  userId: string
  courseId: string
  lastLessonId: string | null
  progressPercentage: number
  enrolledAt: string
}

export interface LessonProgress {
  id: string
  userId: string
  lessonId: string
  completedAt: string
}

// ── Orders & Payments ────────────────────────────────────
export interface Order {
  id: string
  userId: string
  reference: string
  status: "pending" | "approved" | "declined" | "voided" | "error"
  totalInCents: number
  wompiTransactionId: string | null
  items?: OrderItem[]
  createdAt: string
  updatedAt: string
}

export interface OrderItem {
  id: string
  orderId: string
  courseId: string
  priceAtPurchaseInCents: number
  course?: Course
}

// ── Reviews ──────────────────────────────────────────────
export interface Review {
  id: string
  userId: string
  courseId: string
  rating: number
  comment: string
  isApproved: boolean
  user?: Pick<User, "id" | "fullName" | "avatarUrl">
  createdAt: string
}

// ── Combos ───────────────────────────────────────────────
export interface Combo {
  id: string
  title: string
  description: string
  discountPercentage: number
  courseIds: string[]
  isActive: boolean
  createdAt: string
}

// ── Cart ─────────────────────────────────────────────────
export interface CartItem {
  courseId: string
  course: Course
}

// ── Editorial ────────────────────────────────────────────
export interface News {
  id: string
  title: string
  slug: string
  content: string
  coverImageUrl: string | null
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
}

export interface Event {
  id: string
  title: string
  description: string
  date: string
  location: string
  coverImageUrl: string | null
  createdAt: string
}

export interface GalleryImage {
  id: string
  url: string
  alt: string
  category: string
  createdAt: string
}

// ── Audit ────────────────────────────────────────────────
export interface AuditLog {
  id: string
  userId: string
  action: string
  entityType: string
  entityId: string
  metadata: Record<string, unknown>
  createdAt: string
}
