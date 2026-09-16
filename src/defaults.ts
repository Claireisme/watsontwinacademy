import type { Settings } from './types';
export const defaults: Settings = {
 hero_image:'/assets/irish-dance.jpg', teachers_image:'/assets/teachers.jpg', studio_image:'/assets/studio.jpg',
 hero_title: 'Little steps.\nLifelong confidence.',
 hero_intro: 'Discover the joy of Irish dance with Clare and Lisa Watson. A welcoming dance community in Templeogue, South Dublin, with room for every dancer to grow.',
 announcement: 'Your dance journey starts here — explore our classes',
 email: 'dance@watsontwinacademy.ie', phone_clare: '087 9011243', phone_lisa: '087 9731425',
 address: 'Spawell Complex, Templeogue, Dublin, D6W PY06',
 about: 'Identical twins Clare and Lisa have been dancing since the age of four. Qualified with An Chomhdháil in 2013, they bring a shared love of Irish dance, years of performance experience and a personal approach to every class.\n\nTheir purpose-built studios at the Spawell Complex are a home for learning, friendship and the joy of movement.',
 privacy: 'Watson Twin Academy uses the information you provide to respond to your enquiry and help you find a suitable class. Please provide a parent or guardian’s contact details and avoid including sensitive information about a child.\n\nEnquiries are stored in our website database and sent to the academy’s designated inbox. Cloudflare provides website hosting and storage; Resend processes enquiry notification emails. Only authorised academy administrators can access enquiries.\n\nTo ask about your information, request a correction or request deletion, contact dance@watsontwinacademy.ie.',
 reply_time: 'Clare or Lisa will get back to you to discuss a suitable class.'
};
export const seedCourses = [
 {id:'irish-dance',slug:'irish-dance',title:'Irish Dance',category:'Irish dance',summary:'Find your rhythm, build confidence and become part of our Irish dance family.',description:'Explore the rhythm, movement and tradition of Irish dance with Clare and Lisa. Contact us to discuss the right class for your child’s age and experience.',image:'/assets/irish-dance.jpg'},
 {id:'lyrical',slug:'lyrical',title:'Lyrical & Contemporary',category:'Performing arts',summary:'A little imagination. A lot of expression. Discover a new way to move.',description:'Explore expressive movement through lyrical and contemporary dance at WTA Dance Studios. Ask us about current classes and suitable experience levels.',image:'/assets/lyrical.jpg'},
 {id:'acro',slug:'acro-gymnastics',title:'Acro & Gymnastics',category:'Performing arts',summary:'Develop coordination and explore movement, one new skill at a time.',description:'Acro and gymnastics are part of the wider WTA Dance Studios programme. Contact the team for current age groups, class availability and what to bring.',image:'/assets/acro.jpg'},
 {id:'jazz',slug:'jazz-hiphop',title:'Jazz & Hiphop',category:'Performing arts',summary:'Bring your energy and discover the fun of dancing to a different beat.',description:'Our wider performing arts programme includes modern jazz and hiphop / commercial dance. Ask the team about current classes.',image:'/assets/lyrical.jpg'},
 {id:'theatre',slug:'musical-theatre',title:'Musical Theatre & Singing',category:'Performing arts',summary:'Make room for your voice, your imagination and your love of the stage.',description:'Discover musical theatre and vocal training through WTA Dance Studios. Contact us for details of the current programme.',image:'/assets/studio.jpg'},
 {id:'competition',slug:'competition',title:'Competition & Teams',category:'Irish dance',summary:'Take the next step in your dance journey with the academy.',description:'For dancers interested in competition classes and team opportunities, Clare and Lisa can advise on experience requirements and the next suitable step.',image:'/assets/irish-dance.jpg'}
];
