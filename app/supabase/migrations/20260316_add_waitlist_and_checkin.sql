CREATE TYPE waitlist_status AS ENUM ('pending', 'notified', 'joined');

CREATE TABLE waitlists (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workshop_id text REFERENCES workshops(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    email text NOT NULL,
    status waitlist_status DEFAULT 'pending' NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE bookings
ADD COLUMN attended boolean DEFAULT false NOT NULL;

-- Indexes for performance
CREATE INDEX idx_waitlists_workshop ON waitlists(workshop_id);
CREATE INDEX idx_waitlists_user ON waitlists(user_id);
CREATE INDEX idx_waitlists_email ON waitlists(email);

-- Enable RLS
ALTER TABLE waitlists ENABLE ROW LEVEL SECURITY;

-- RLS Policies for waitlists
CREATE POLICY "Users can insert their own waitlist entries"
    ON waitlists FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own waitlist entries"
    ON waitlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Hosts can view waitlists for their workshops"
    ON waitlists FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM workshops
            WHERE workshops.id = waitlists.workshop_id
            AND workshops.host_user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can do anything on waitlists"
    ON waitlists FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid() AND profiles.is_admin = true
        )
    );
