import { z } from 'zod';
const text=(max:number)=>z.string().trim().max(max);
export const imagePath=z.string().regex(/^\/(?:assets|media)\/[a-zA-Z0-9._/-]+$/).refine(s=>!s.includes('..'),'Invalid image path');
export const settingsSchema=z.object({
 hero_image:imagePath.default('/assets/irish-dance.jpg'),teachers_image:imagePath.default('/assets/teachers.jpg'),studio_image:imagePath.default('/assets/studio.jpg'),
 hero_title:text(100).min(5),hero_intro:text(600).min(20),announcement:text(160),
 email:z.email().max(200),phone_clare:text(40).regex(/^[+\d\s()-]*$/),phone_lisa:text(40).regex(/^[+\d\s()-]*$/),address:text(300).min(5),about:text(10000).min(30),privacy:text(15000).min(50),reply_time:text(300).min(10),version:z.number().int().nonnegative()
});
export const courseSchema=z.object({slug:text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),title:text(100).min(2),category:z.enum(['Irish dance','Performing arts']),summary:text(250).min(10),description:text(6000).min(20),ages:text(100),schedule:text(1000),price:text(200),image:imagePath,published:z.number().int().min(0).max(1),sort_order:z.number().int().min(0).max(1000),version:z.number().int().nonnegative()});
export const gallerySchema=z.object({image:imagePath,alt:text(200).min(5),category:text(60).min(2),published:z.number().int().min(0).max(1),sort_order:z.number().int().min(0).max(1000)});
export const enquirySchema=z.object({id:z.uuid(),parent_name:text(100).min(2),email:z.email().max(200),phone:text(40).regex(/^[+\d\s()-]*$/),age_group:z.enum(['','Under 5','5–7','8–11','12–17','18+']),course_id:text(100),message:text(3000),consent:z.literal(true),website:text(100).default(''),turnstile:text(2048).min(1)});
export const statusSchema=z.enum(['new','contacted','enrolled','closed']);
