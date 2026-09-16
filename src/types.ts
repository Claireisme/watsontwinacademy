export interface Env {
 DB: D1Database; MEDIA: R2Bucket; ASSETS: Fetcher;
 PUBLIC_SITE_URL?: string; SITE_URL: string; ENVIRONMENT: string; LOCAL_ADMIN_TOKEN?: string; LOCAL_PREVIEW_ORIGIN?: string;
 ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string; ADMIN_EMAILS?: string;
 TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string;
 RESEND_API_KEY?: string; MAIL_FROM?: string; NOTIFICATION_EMAIL?: string;
}
export type AppEnv = { Bindings: Env; Variables: { actor: string; nonce: string } };
export interface Course { id: string; slug: string; title: string; category: string; summary: string; description: string; ages: string; schedule: string; price: string; image: string; published: number; sort_order: number; version: number; updated_at: string }
export interface GalleryItem { id: string; image: string; alt: string; category: string; published: number; sort_order: number }
export interface Settings { hero_image:string; teachers_image:string; studio_image:string; hero_title: string; hero_intro: string; announcement: string; email: string; phone_clare: string; phone_lisa: string; address: string; about: string; privacy: string; reply_time: string }
export interface Enquiry { id: string; parent_name: string; email: string; phone: string; age_group: string; course_id: string | null; message: string; status: string; created_at: string; course_title?: string; mail_status?: string; attempts?: number; last_error?: string }
