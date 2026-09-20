"""
Supabase client setup.

Set these environment variables before running the app:
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_KEY=your-service-role-or-anon-key

Table schema (create in the Supabase SQL editor):

create table assessments (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone default now(),
    name text,
    email text,
    age integer,
    inputs jsonb not null,
    combined_score float,
    risk_level text,
    model_probability float,
    rule_based_score float,
    appointment_requested boolean default false
);

create table appointments (
    id uuid primary key default gen_random_uuid(),
    created_at timestamp with time zone default now(),
    assessment_id uuid references assessments(id),
    name text,
    email text,
    phone text,
    preferred_provider text,
    status text default 'pending'
);
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set as environment variables."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client
