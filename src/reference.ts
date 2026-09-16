/** Public reference uses the academy's local calendar date. */
export function newReference(date = new Date()): string {
 const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Dublin',year:'2-digit',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part = (name:string) => parts.find(p=>p.type===name)!.value;
 let letters = '';
 while(letters.length<3){
  const byte=crypto.getRandomValues(new Uint8Array(1))[0];
  // Rejection sampling avoids favouring letters at the start of the alphabet.
  if(byte<234)letters+=String.fromCharCode(97+byte%26);
 }
 return part('year')+part('month')+part('day')+letters;
}
