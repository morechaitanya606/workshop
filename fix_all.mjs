import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
    });
}

// 2. Add missing fields to database.types.ts (profiles & workshops & waitlists)
let typesFile = 'app/src/lib/database.types.ts';
let content = fs.readFileSync(typesFile, 'utf8');

// profiles
content = content.replace(/date_of_birth: string \| null;/g, 'date_of_birth: string | null;\n                    avatar_url?: string | null;');
content = content.replace(/date_of_birth\?: string \| null;/g, 'date_of_birth?: string | null;\n                    avatar_url?: string | null;');

// workshops
content = content.replace(/what_you_learn: string\[\];/g, 'what_you_learn: string[];\n                    badge_labels?: string[] | null;\n                    event_address?: string | null;\n                    latitude?: number | null;\n                    longitude?: number | null;\n                    location_images?: string[] | null;');
content = content.replace(/what_you_learn\?: string\[\];/g, 'what_you_learn?: string[];\n                    badge_labels?: string[] | null;\n                    event_address?: string | null;\n                    latitude?: number | null;\n                    longitude?: number | null;\n                    location_images?: string[] | null;');

// waitlists table
if (!content.includes('waitlists: {')) {
    content = content.replace(/workshops: {/g, `waitlists: {
                Row: {
                    id: string;
                    user_id: string;
                    workshop_id: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    workshop_id: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    workshop_id?: string;
                    created_at?: string;
                };
                Relationships: [];
            };
            workshops: {`);
}

fs.writeFileSync(typesFile, content);

console.log("Fixed database.types.ts");
