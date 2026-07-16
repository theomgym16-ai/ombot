// Canned WhatsApp menu content for THE OM GYM.
// Anything marked PLACEHOLDER below is not real gym data yet — the owner
// needs to supply the actual value before this goes live.

export const MAIN_MENU_ROWS = [
  { id: "menu_plans", title: "Membership Plans" },
  { id: "menu_timings", title: "Gym Timings" },
  { id: "menu_trial", title: "Free Trial" },
  { id: "menu_join", title: "Join Now" },
  { id: "menu_pt", title: "Personal Training" },
  { id: "menu_diet", title: "Diet Plans" },
  { id: "menu_progress", title: "Progress Tracking" },
  { id: "menu_location", title: "Location" },
  { id: "menu_contact", title: "Contact Staff" },
  { id: "menu_support", title: "Existing Member Support" },
];

export const SUPPORT_MENU_ROWS = [
  { id: "support_payment", title: "Payment Issue" },
  { id: "support_membership", title: "Membership" },
  { id: "support_equipment", title: "Equipment" },
  { id: "support_complaint", title: "Complaint" },
  { id: "support_staff", title: "Talk to Staff" },
];

export const PREMIUM_BENEFITS_TEXT = `⭐ Premium Benefits
✔️ Free Diet Guidance
✔️ Monthly Progress Check
✔️ Modern Equipment`;

// PLACEHOLDER — replace with real opening hours.
export const GYM_TIMINGS_TEXT = `⏰ Gym Timings

Mon–Sat: 6:00 AM – 10:00 PM
Sunday: 7:00 AM – 12:00 PM

(Timings shown are a placeholder — confirm actual hours with the gym owner.)`;

export const FREE_TRIAL_TEXT = `🎉 Free Trial

Want to experience THE OM GYM before joining? Reply YES and our staff will confirm a free trial slot for you within 24 hours.`;

export const JOIN_NOW_TEXT = `Great! To join THE OM GYM, choose your payment method:

💳 UPI
🏦 Bank Transfer
💵 Cash

After payment, please send the screenshot and our staff will confirm your membership.`;

export const PERSONAL_TRAINING_TEXT = `🏋️ Personal Training

Get 1-on-1 coaching tailored to your goals. Reply PT and our trainer will reach out to discuss plans and pricing.`;

export const DIET_PLANS_TEXT = `🥗 Diet Plans

All members get free diet guidance as part of their membership. Reply DIET and our trainer will share a personalized plan based on your goals.`;

// PLACEHOLDER — replace with real address and maps link.
export const LOCATION_TEXT = `📍 THE OM GYM

Address: (add gym address here)
Google Maps: (add maps link here)`;

// PLACEHOLDER — replace with a real staff contact number.
export const CONTACT_STAFF_TEXT = `📞 Contact Staff

Reply here anytime and our team will get back to you shortly, or call us at (add staff contact number here).`;

export const EXISTING_MEMBER_SUPPORT_TEXT = `Need help?

Choose an option below and our staff will follow up.`;

export const SUPPORT_RESPONSES = {
  support_payment:
    "We've noted your payment issue. Our staff will contact you shortly to resolve it.",
  support_membership:
    "Our staff will get back to you regarding your membership shortly.",
  support_equipment:
    "Thanks for reporting an equipment issue. Our team will look into it.",
  support_complaint:
    "We're sorry to hear that. Your complaint has been logged and our team will reach out.",
  support_staff:
    "Connecting you with our staff — someone will reach out to you shortly.",
};

export const MENU_TRIGGER_WORDS = ["hi", "hello", "hey", "menu", "start"];

export const INVALID_SELECTION_TEXT =
  "Sorry, I didn't get that. Please choose an option from the menu above, or reply MENU to see it again.";
