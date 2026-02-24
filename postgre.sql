-- Create the database
CREATE DATABASE campus_issue_db;

-- Create ENUM types first
CREATE TYPE user_role AS ENUM ('user', 'supervisor', 'admin');
CREATE TYPE issue_status AS ENUM ('pending', 'rejected', 'processing', 'completed');
CREATE TYPE vote_type AS ENUM ('upvote', 'downvote');
CREATE TYPE transaction_type AS ENUM ('reward', 'distribution');

-- Users table (for all types of users)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role user_role DEFAULT 'user',
    credits INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Issues table
CREATE TABLE issues (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category_id INTEGER,
    status issue_status DEFAULT 'pending',
    user_id INTEGER,
    supervisor_id INTEGER NULL,
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id)
);

-- Issue votes table (to track user votes)
CREATE TABLE issue_votes (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER,
    user_id INTEGER,
    vote_type vote_type,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (issue_id, user_id),
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Comments table
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER,
    user_id INTEGER,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Supervisor categories (to assign supervisors to categories)
CREATE TABLE supervisor_categories (
    id SERIAL PRIMARY KEY,
    supervisor_id INTEGER,
    category_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (supervisor_id, category_id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Credit transactions table
CREATE TABLE credit_transactions (
    id SERIAL PRIMARY KEY,
    from_supervisor_id INTEGER NULL,
    to_supervisor_id INTEGER NOT NULL,
    issue_id INTEGER NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    transaction_type transaction_type NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_supervisor_id) REFERENCES users(id),
    FOREIGN KEY (to_supervisor_id) REFERENCES users(id),
    FOREIGN KEY (issue_id) REFERENCES issues(id)
);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, password, email, role) 
VALUES ('admin', '$2b$10$r8v6Wk9sS7t3JxYfVqjZ0uB7nN6mC4vE2gH1dF3rT5yM7pL9K0iW', 'admin@campus.edu', 'admin');

-- Insert some default categories
INSERT INTO categories (name, description) VALUES
('Mess', 'Issues related to campus dining and food services'),
('Sanitation', 'Problems with cleanliness and waste management'),
('Infrastructure', 'Building, facility, and equipment related issues'),
('Academic', 'Concerns related to courses, exams, and teaching'),
('Hostel', 'Residential accommodation problems');

-- Update admin password hash
UPDATE users SET password = '$2b$10$TwtgVjjZJnCcPmK577Cwe.XG4unlKqxSv1d7X665Yg8zolw4HWk0a' WHERE username = 'admin';

-- Change the default value for future inserts
ALTER TABLE users 
ALTER COLUMN credits SET DEFAULT 25;

UPDATE users 
SET credits = 25 
WHERE role = 'supervisor' AND id > 0;

-- Add GIN index for full-text search functionality
CREATE INDEX idx_issues_title_description ON issues USING gin(to_tsvector('english', title || ' ' || description));

-- Function to update updated_at timestamp (replaces ON UPDATE CURRENT_TIMESTAMP)
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = CURRENT_TIMESTAMP;
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- -- Create triggers for updated_at
-- CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- CREATE TRIGGER update_issues_updated_at BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Query for search functionality (equivalent to your LIKE query)
-- Display all users with basic info
SELECT id, username, email, role, credits, created_at 
FROM users 
ORDER BY created_at DESC;