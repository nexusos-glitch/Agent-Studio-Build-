/** 
 * Supabase Schema for Agent Studio
 */

-- Users table
CREATE TABLE public.users (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Agents table
CREATE TABLE public.agents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  model_id TEXT NOT NULL,
  system_prompt TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Agent Interactions (History) table
CREATE TABLE public.agent_interactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  input_text TEXT NOT NULL,
  output_text TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_interactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own profile" ON public.users 
  FOR SELECT USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY "Admins can view all users" ON public.users 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Agents policies
CREATE POLICY "Users can view public agents" ON public.agents
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can view own agents" ON public.agents
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own agents" ON public.agents
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own agents" ON public.agents
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own agents" ON public.agents
  FOR DELETE USING (owner_id = auth.uid());

-- Agent Interactions policies
CREATE POLICY "Users can view own interactions" ON public.agent_interactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own interactions" ON public.agent_interactions
  FOR INSERT WITH CHECK (user_id = auth.uid());
