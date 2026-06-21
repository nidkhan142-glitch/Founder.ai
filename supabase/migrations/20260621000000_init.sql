-- Initial schema setup for FounderAI v1
-- Enabling UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create ideas table
CREATE TABLE IF NOT EXISTS public.ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    problem TEXT NOT NULL,
    customer TEXT NOT NULL,
    current_solution TEXT NOT NULL,
    frequency TEXT NOT NULL,
    consequence TEXT NOT NULL,
    why_you TEXT NOT NULL,
    evidence_level TEXT NOT NULL,
    goal TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create reports table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID REFERENCES public.ideas(id) ON DELETE CASCADE,
    raw_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create checkins table (for v2, stubbed in v1)
CREATE TABLE IF NOT EXISTS public.checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID REFERENCES public.ideas(id) ON DELETE CASCADE,
    scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
    completed BOOLEAN DEFAULT FALSE NOT NULL,
    response_text TEXT,
    decision TEXT CHECK (decision IN ('Proceed', 'Pivot', 'Abandon')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

-- Set up security policies (Allow authenticated users to manage their own data)
CREATE POLICY "Users can create their own ideas" ON public.ideas
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own ideas" ON public.ideas
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own ideas" ON public.ideas
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ideas" ON public.ideas
    FOR DELETE USING (auth.uid() = user_id);

-- Reports security policies (linked to ideas)
CREATE POLICY "Users can view reports for their ideas" ON public.reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ideas 
            WHERE public.ideas.id = public.reports.idea_id AND public.ideas.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert reports for their ideas" ON public.reports
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ideas 
            WHERE public.ideas.id = public.reports.idea_id AND public.ideas.user_id = auth.uid()
        )
    );

-- Checkins security policies (linked to ideas)
CREATE POLICY "Users can view checkins for their ideas" ON public.checkins
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ideas 
            WHERE public.ideas.id = public.checkins.idea_id AND public.ideas.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage checkins for their ideas" ON public.checkins
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.ideas 
            WHERE public.ideas.id = public.checkins.idea_id AND public.ideas.user_id = auth.uid()
        )
    );
