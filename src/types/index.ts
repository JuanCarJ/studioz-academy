// ── Users ────────────────────────────────────────────────
export interface Profile {
  id: string
  full_name: string
  phone: string | null
  avatar_url: string | null
  role: "user" | "admin"
  email_notifications: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// ── Instructors ──────────────────────────────────────────
export interface Instructor {
  id: string
  slug: string
  full_name: string
  bio: string | null
  avatar_url: string | null
  specialties: string[]
  years_experience: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Courses ──────────────────────────────────────────────
export interface Course {
  id: string
  title: string
  slug: string
  description: string | null
  short_description: string | null
  category: "baile" | "tatuaje"
  price: number
  list_price: number
  current_price: number
  is_free: boolean
  course_discount_enabled: boolean
  course_discount_type: "percentage" | "fixed" | null
  course_discount_value: number | null
  has_course_discount: boolean
  course_discount_amount: number
  course_discount_label: string | null
  thumbnail_url: string | null
  preview_video_url: string | null
  preview_bunny_video_id: string | null
  preview_bunny_library_id: string | null
  preview_status: "none" | "legacy" | "processing" | "ready" | "error"
  preview_last_checked_at: string | null
  preview_last_state_changed_at: string | null
  pending_preview_bunny_video_id: string | null
  pending_preview_bunny_library_id: string | null
  pending_preview_status: "none" | "processing" | "ready" | "error"
  preview_upload_error: string | null
  instructor_id: string
  instructor?: Instructor
  legacy_instructor_name: string | null
  rating_avg: number | null
  reviews_count: number
  is_published: boolean
  published_at: string | null
  lessons?: Lesson[]
  created_at: string
  updated_at: string
}

// ── Lessons ──────────────────────────────────────────────
export interface Lesson {
  id: string
  course_id: string
  title: string
  description: string | null
  bunny_video_id: string
  bunny_library_id: string
  bunny_status: "processing" | "ready" | "error"
  bunny_last_checked_at: string | null
  bunny_last_state_changed_at: string | null
  pending_bunny_video_id: string | null
  pending_bunny_library_id: string | null
  pending_bunny_status: "none" | "processing" | "ready" | "error"
  video_upload_error: string | null
  duration_seconds: number
  sort_order: number
  is_free: boolean
  created_at: string
  updated_at: string
}

export interface BunnyUploadSession {
  videoId: string
  libraryId: string
  expirationTime: number
  signature: string
  tusEndpoint: string
}

// ── Cart ─────────────────────────────────────────────────
export interface CartItem {
  id: string
  user_id: string
  course_id: string
  added_at: string
  course?: Course
}

// ── Discount Rules ───────────────────────────────────────
export interface DiscountRule {
  id: string
  name: string
  category: "baile" | "tatuaje" | null
  combo_kind: "threshold_discount" | "buy_x_get_y"
  min_courses: number
  discount_type: "percentage" | "fixed" | null
  discount_value: number | null
  buy_quantity: number | null
  free_quantity: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PricingLine {
  scope: "course" | "cart"
  kind: "course_discount" | "combo"
  source_id: string | null
  source_name: string
  course_id: string | null
  course_title: string | null
  amount: number
  metadata: Json | null
}

export interface PricedCartItem {
  course_id: string
  course_title: string
  list_price: number
  course_discount_amount: number
  price_after_course_discount: number
  combo_discount_amount: number
  final_price: number
  course_promotion_label: string | null
  combo_promotion_label: string | null
}

// ── Orders & Payments ────────────────────────────────────
export interface Order {
  id: string
  user_id: string | null
  customer_name_snapshot: string
  customer_email_snapshot: string
  customer_phone_snapshot: string | null
  reference: string
  list_subtotal: number
  subtotal: number
  course_discount_amount: number
  combo_discount_amount: number
  discount_amount: number
  total: number
  discount_rule_id: string | null
  discount_rule_name_snapshot: string | null
  pricing_snapshot_json: Json | null
  status: "pending" | "approved" | "declined" | "voided" | "refunded" | "chargeback"
  wompi_transaction_id: string | null
  payment_method: string | null
  payment_detail: string | null
  currency: string
  is_user_anonymized: boolean
  anonymized_at: string | null
  created_at: string
  approved_at: string | null
  reverted_at: string | null
  updated_at: string
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  course_id: string | null
  course_title_snapshot: string
  price_at_purchase: number
  list_price_snapshot: number
  course_discount_amount_snapshot: number
  price_after_course_discount_snapshot: number
  combo_discount_amount_snapshot: number
  final_price_snapshot: number
  created_at: string
  course?: Course
}

export interface OrderDiscountLine {
  id: string
  order_id: string
  scope: "course" | "cart"
  kind: "course_discount" | "combo"
  source_id: string | null
  source_name_snapshot: string
  course_id: string | null
  course_title_snapshot: string | null
  amount: number
  metadata_json: Json
  created_at: string
}

export interface PaymentEvent {
  id: string
  order_id: string
  source: "webhook" | "reconciliation" | "manual" | "polling"
  wompi_transaction_id: string | null
  external_status: string
  mapped_status: string
  is_applied: boolean
  reason: string | null
  payload_hash: string
  payload_json: Record<string, unknown>
  processed_at: string
}

// ── Enrollments & Progress ───────────────────────────────
export interface Enrollment {
  id: string
  user_id: string
  course_id: string
  source: "purchase" | "free"
  order_id: string | null
  enrolled_at: string
}

export interface CourseProgress {
  id: string
  user_id: string
  course_id: string
  last_lesson_id: string | null
  completed_lessons: number
  is_completed: boolean
  last_accessed_at: string
}

export interface LessonProgress {
  id: string
  user_id: string
  lesson_id: string
  completed: boolean
  completed_at: string | null
  video_position: number
}

// ── Email Outbox ────────────────────────────────────────────
export interface OrderEmailOutbox {
  id: string
  order_id: string
  email_type: string
  status: "pending" | "sent" | "failed"
  attempts: number
  next_attempt_at: string
  last_error: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

// ── Notifications ────────────────────────────────────────
export interface CourseNotification {
  id: string
  course_id: string
  sent_by: string
  recipients_count: number
  sent_at: string
}

// ── Reviews ──────────────────────────────────────────────
export interface Review {
  id: string
  user_id: string
  course_id: string
  rating: number
  text: string | null
  is_visible: boolean
  created_at: string
  updated_at: string
  user?: Pick<Profile, "id" | "full_name" | "avatar_url">
}

// ── Audit ────────────────────────────────────────────────
export interface AdminAuditLog {
  id: string
  admin_user_id: string
  action: string
  entity_type: string
  entity_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  result: "success" | "failure"
  metadata: Record<string, unknown> | null
  created_at: string
}

// ── Editorial ────────────────────────────────────────────
export interface Post {
  id: string
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  cover_image_url: string | null
  is_published: boolean
  images?: PostImage[]
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface PostImage {
  id: string
  post_id: string
  image_url: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  title: string
  description: string | null
  image_url: string | null
  event_date: string
  location: string | null
  is_published: boolean
  images?: EventImage[]
  created_at: string
  updated_at: string
}

export interface EventImage {
  id: string
  event_id: string
  image_url: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface GalleryItem {
  id: string
  image_url: string
  caption: string | null
  category: "baile" | "tatuaje"
  sort_order: number
  created_at: string
  updated_at: string
}

// ── Contact ──────────────────────────────────────────────
export interface ContactMessage {
  id: string
  name: string
  email: string
  subject: string | null
  message: string
  is_read: boolean
  created_at: string
}
import type { Json } from "@/types/database"
