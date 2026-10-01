/**
 * Localised strings for the chatbot: canned replies (server) and widget UI text (client).
 * Pure and client-safe. One complete set per locale, so nothing silently falls back to English.
 */

import type { ChatLocale } from "@/lib/chatbot-language";

export type ChatbotStrings = {
    // Canned replies
    greeting: string;
    thanks: string;
    guidance: string;
    fallback: string;
    askName: string;
    invalidName: string;
    askPhone: string;
    missingName: string;
    invalidPhone: string;
    bookingComplete: string;
    /** Prefix for facts we can only provide in English (no model available). */
    englishOnlyNote: string;
    // Errors
    error: string;
    rateLimited: string;
    // Widget UI
    subtitle: string;
    placeholderIdle: string;
    placeholderName: string;
    placeholderPhone: string;
    inputLabel: string;
    typing: string;
    send: string;
    close: string;
    retry: string;
    completeBooking: string;
    quickRepliesLabel: string;
    quickReplies: readonly string[];
    welcome: (clientName?: string) => string;
};

export const CHATBOT_STRINGS: Record<ChatLocale, ChatbotStrings> = {
    en: {
        greeting:
            "Hi! I can help you find workshops, check dates, prices and seats, and answer booking, payment or cancellation questions. What are you looking for?",
        thanks: "You're welcome! Let me know if you'd like help with anything else.",
        guidance:
            "Tell me what you'd like to do, for example a workshop name, category, city or budget, or ask about booking, payment or cancellation.",
        fallback:
            "I couldn't find the exact info. Please contact support: [Contact us](/contact) or WhatsApp +91 70284 78109.",
        askName: "To start the booking, please share your name.",
        invalidName: "Before we continue, please share a valid name.",
        askPhone: "Perfect. Now please share your 10-digit phone number.",
        missingName: "Before you share your phone number, please tell me your name.",
        invalidPhone: "Please share a valid 10-digit phone number.",
        bookingComplete: "Thanks! You can complete your booking using the button below.",
        englishOnlyNote: "",
        error: "Sorry, I can't reply right now. Please try again in a moment.",
        rateLimited: "You're sending messages too quickly. Please wait a moment and try again.",
        subtitle: "Workshops, booking and support",
        placeholderIdle: "Type your message",
        placeholderName: "Enter your name",
        placeholderPhone: "Enter your 10-digit phone number",
        inputLabel: "Message to the assistant",
        typing: "Assistant is typing...",
        send: "Send message",
        close: "Close chat",
        retry: "Retry",
        completeBooking: "Complete Booking",
        quickRepliesLabel: "Suggested questions",
        quickReplies: [
            "Upcoming workshops",
            "Workshops this weekend",
            "How do I book?",
            "Refund policy",
        ],
        welcome: (clientName) =>
            clientName
                ? `Hi! I'm the ${clientName} assistant. Ask me about workshops, dates, prices, booking, payments or cancellation. You can write in English, Hindi or Marathi.`
                : "Hi! Ask me about workshops, dates, prices, booking, payments or cancellation. You can write in English, Hindi or Marathi.",
    },
    hi: {
        greeting:
            "नमस्ते! मैं वर्कशॉप खोजने, तारीख, कीमत और बची हुई सीटें बताने, और बुकिंग, पेमेंट या कैंसिलेशन के सवालों में आपकी मदद कर सकता हूँ। आप क्या ढूँढ रहे हैं?",
        thanks: "आपका स्वागत है! कुछ और जानना हो तो बेझिझक पूछिए।",
        guidance:
            "बताइए आपको क्या चाहिए, जैसे वर्कशॉप का नाम, कैटेगरी, शहर या बजट, या बुकिंग, पेमेंट और कैंसिलेशन के बारे में पूछिए।",
        fallback:
            "मुझे इसकी सटीक जानकारी नहीं मिली। कृपया सपोर्ट से संपर्क करें: [संपर्क करें](/contact) या WhatsApp +91 70284 78109।",
        askName: "बुकिंग शुरू करने के लिए कृपया अपना नाम बताइए।",
        invalidName: "आगे बढ़ने से पहले कृपया सही नाम बताइए।",
        askPhone: "बढ़िया। अब कृपया अपना 10 अंकों का फ़ोन नंबर बताइए।",
        missingName: "फ़ोन नंबर बताने से पहले कृपया अपना नाम बताइए।",
        invalidPhone: "कृपया सही 10 अंकों का फ़ोन नंबर बताइए।",
        bookingComplete: "धन्यवाद! नीचे दिए बटन से आप अपनी बुकिंग पूरी कर सकते हैं।",
        englishOnlyNote: "फ़िलहाल यह जानकारी अंग्रेज़ी में उपलब्ध है:",
        error: "माफ़ कीजिए, अभी मैं जवाब नहीं दे पा रहा हूँ। कृपया थोड़ी देर बाद फिर कोशिश करें।",
        rateLimited: "आपने बहुत जल्दी-जल्दी संदेश भेजे हैं। कृपया थोड़ा रुककर फिर कोशिश करें।",
        subtitle: "वर्कशॉप, बुकिंग और सपोर्ट",
        placeholderIdle: "अपना संदेश लिखें",
        placeholderName: "अपना नाम लिखें",
        placeholderPhone: "अपना 10 अंकों का फ़ोन नंबर लिखें",
        inputLabel: "असिस्टेंट को संदेश",
        typing: "असिस्टेंट लिख रहा है...",
        send: "संदेश भेजें",
        close: "चैट बंद करें",
        retry: "फिर कोशिश करें",
        completeBooking: "बुकिंग पूरी करें",
        quickRepliesLabel: "सुझाए गए सवाल",
        quickReplies: [
            "आने वाली वर्कशॉप्स",
            "इस वीकेंड की वर्कशॉप्स",
            "बुकिंग कैसे करें?",
            "रिफंड पॉलिसी",
        ],
        welcome: (clientName) =>
            clientName
                ? `नमस्ते! मैं ${clientName} का असिस्टेंट हूँ। वर्कशॉप, तारीख, कीमत, बुकिंग, पेमेंट या कैंसिलेशन के बारे में पूछिए। आप हिंदी, मराठी या English में लिख सकते हैं।`
                : "नमस्ते! वर्कशॉप, तारीख, कीमत, बुकिंग, पेमेंट या कैंसिलेशन के बारे में पूछिए। आप हिंदी, मराठी या English में लिख सकते हैं।",
    },
    mr: {
        greeting:
            "नमस्कार! मी वर्कशॉप शोधण्यात, तारीख, किंमत आणि उरलेल्या जागा सांगण्यात, तसेच बुकिंग, पेमेंट किंवा कॅन्सलेशनच्या प्रश्नांत तुमची मदत करू शकतो. तुम्ही काय शोधत आहात?",
        thanks: "तुमचे स्वागत आहे! आणखी काही हवे असल्यास नक्की विचारा.",
        guidance:
            "तुम्हाला काय हवे ते सांगा, उदा. वर्कशॉपचे नाव, कॅटेगरी, शहर किंवा बजेट, किंवा बुकिंग, पेमेंट आणि कॅन्सलेशनबद्दल विचारा.",
        fallback:
            "मला याची नेमकी माहिती सापडली नाही. कृपया सपोर्टशी संपर्क साधा: [संपर्क](/contact) किंवा WhatsApp +91 70284 78109.",
        askName: "बुकिंग सुरू करण्यासाठी कृपया तुमचे नाव सांगा.",
        invalidName: "पुढे जाण्यापूर्वी कृपया योग्य नाव सांगा.",
        askPhone: "छान. आता कृपया तुमचा 10 अंकी फोन नंबर सांगा.",
        missingName: "फोन नंबर सांगण्यापूर्वी कृपया तुमचे नाव सांगा.",
        invalidPhone: "कृपया योग्य 10 अंकी फोन नंबर सांगा.",
        bookingComplete: "धन्यवाद! खालील बटणावरून तुम्ही तुमची बुकिंग पूर्ण करू शकता.",
        englishOnlyNote: "सध्या ही माहिती इंग्रजीत उपलब्ध आहे:",
        error: "क्षमस्व, सध्या मी उत्तर देऊ शकत नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
        rateLimited:
            "तुम्ही खूप वेगाने संदेश पाठवले आहेत. कृपया थोडा वेळ थांबून पुन्हा प्रयत्न करा.",
        subtitle: "वर्कशॉप, बुकिंग आणि सपोर्ट",
        placeholderIdle: "तुमचा संदेश लिहा",
        placeholderName: "तुमचे नाव लिहा",
        placeholderPhone: "तुमचा 10 अंकी फोन नंबर लिहा",
        inputLabel: "असिस्टंटला संदेश",
        typing: "असिस्टंट लिहित आहे...",
        send: "संदेश पाठवा",
        close: "चॅट बंद करा",
        retry: "पुन्हा प्रयत्न करा",
        completeBooking: "बुकिंग पूर्ण करा",
        quickRepliesLabel: "सुचवलेले प्रश्न",
        quickReplies: [
            "आगामी वर्कशॉप्स",
            "या वीकेंडच्या वर्कशॉप्स",
            "बुकिंग कसे करायचे?",
            "रिफंड पॉलिसी",
        ],
        welcome: (clientName) =>
            clientName
                ? `नमस्कार! मी ${clientName} चा असिस्टंट आहे. वर्कशॉप, तारीख, किंमत, बुकिंग, पेमेंट किंवा कॅन्सलेशनबद्दल विचारा. तुम्ही मराठी, हिंदी किंवा English मध्ये लिहू शकता.`
                : "नमस्कार! वर्कशॉप, तारीख, किंमत, बुकिंग, पेमेंट किंवा कॅन्सलेशनबद्दल विचारा. तुम्ही मराठी, हिंदी किंवा English मध्ये लिहू शकता.",
    },
    "hi-Latn": {
        greeting:
            "Namaste! Main workshops dhundhne, date, price aur bachi hui seats batane, aur booking, payment ya cancellation ke sawaalon mein aapki madad kar sakta hoon. Aap kya dhundh rahe ho?",
        thanks: "Aapka swagat hai! Kuch aur jaanna ho toh bejhijhak poochho.",
        guidance:
            "Bataiye aapko kya chahiye, jaise workshop ka naam, category, city ya budget, ya booking, payment aur cancellation ke baare mein poochiye.",
        fallback:
            "Mujhe iski exact jaankari nahi mili. Please support se contact karein: [Contact us](/contact) ya WhatsApp +91 70284 78109.",
        askName: "Booking shuru karne ke liye please apna naam batayein.",
        invalidName: "Aage badhne se pehle please sahi naam batayein.",
        askPhone: "Badhiya. Ab please apna 10-digit phone number batayein.",
        missingName: "Phone number batane se pehle please apna naam batayein.",
        invalidPhone: "Please sahi 10-digit phone number batayein.",
        bookingComplete: "Thanks! Neeche diye button se aap apni booking poori kar sakte hain.",
        englishOnlyNote: "Abhi yeh jaankari sirf English mein hai:",
        error: "Sorry, main abhi reply nahi kar pa raha hoon. Please thodi der baad try karein.",
        rateLimited: "Aapne bahut tezi se messages bheje hain. Please thoda ruk kar try karein.",
        subtitle: "Workshops, booking aur support",
        placeholderIdle: "Apna message likhein",
        placeholderName: "Apna naam likhein",
        placeholderPhone: "Apna 10-digit phone number likhein",
        inputLabel: "Assistant ko message",
        typing: "Assistant likh raha hai...",
        send: "Message bhejein",
        close: "Chat band karein",
        retry: "Phir try karein",
        completeBooking: "Booking poori karein",
        quickRepliesLabel: "Suggested sawaal",
        quickReplies: [
            "Upcoming workshops",
            "Is weekend ki workshops",
            "Booking kaise karein?",
            "Refund policy kya hai?",
        ],
        welcome: (clientName) =>
            clientName
                ? `Namaste! Main ${clientName} ka assistant hoon. Workshops, date, price, booking, payment ya cancellation ke baare mein poochiye. Aap Hindi, Marathi ya English mein likh sakte hain.`
                : "Namaste! Workshops, date, price, booking, payment ya cancellation ke baare mein poochiye. Aap Hindi, Marathi ya English mein likh sakte hain.",
    },
    "mr-Latn": {
        greeting:
            "Namaskar! Mi workshops shodhayla, date, kimmat ani urlelya jaga sangayla, tasech booking, payment kiva cancellation chya prashnanmadhye tumchi madat karu shakto. Tumhi kay shodhat aahat?",
        thanks: "Tumche swagat aahe! Anakhi kahi hava asel tar nakki vichara.",
        guidance:
            "Tumhala kay hava te sanga, jase ki workshop che naav, category, shahar kiva budget, kiva booking, payment ani cancellation baddal vichara.",
        fallback:
            "Mala yachi nemki mahiti sapadli nahi. Krupaya support shi sampark sadha: [Contact us](/contact) kiva WhatsApp +91 70284 78109.",
        askName: "Booking suru karnyasathi krupaya tumche naav sanga.",
        invalidName: "Pudhe jaanyapurvi krupaya yogya naav sanga.",
        askPhone: "Chaan. Aata krupaya tumcha 10-digit phone number sanga.",
        missingName: "Phone number sangnyapurvi krupaya tumche naav sanga.",
        invalidPhone: "Krupaya yogya 10-digit phone number sanga.",
        bookingComplete: "Dhanyavad! Khalil button varun tumhi tumchi booking purna karu shakta.",
        englishOnlyNote: "Sadhya hi mahiti fakt English madhye aahe:",
        error: "Kshama kara, sadhya mi uttar deu shakat nahi. Krupaya thodya velane punha prayatna kara.",
        rateLimited:
            "Tumhi khup veganne messages pathavle aahet. Krupaya thoda vel thambun punha prayatna kara.",
        subtitle: "Workshops, booking ani support",
        placeholderIdle: "Tumcha message liha",
        placeholderName: "Tumche naav liha",
        placeholderPhone: "Tumcha 10-digit phone number liha",
        inputLabel: "Assistant la message",
        typing: "Assistant liht aahe...",
        send: "Message pathava",
        close: "Chat band kara",
        retry: "Punha prayatna kara",
        completeBooking: "Booking purna kara",
        quickRepliesLabel: "Suchavlele prashna",
        quickReplies: [
            "Upcoming workshops",
            "Ya weekend chya workshops",
            "Booking kase karayche?",
            "Refund policy kay aahe?",
        ],
        welcome: (clientName) =>
            clientName
                ? `Namaskar! Mi ${clientName} cha assistant aahe. Workshops, date, kimmat, booking, payment kiva cancellation baddal vichara. Tumhi Marathi, Hindi kiva English madhye liju shakta.`
                : "Namaskar! Workshops, date, kimmat, booking, payment kiva cancellation baddal vichara. Tumhi Marathi, Hindi kiva English madhye liju shakta.",
    },
};

export function getChatbotStrings(locale: ChatLocale): ChatbotStrings {
    return CHATBOT_STRINGS[locale] ?? CHATBOT_STRINGS.en;
}
