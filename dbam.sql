-- Create the database
CREATE DATABASE campus_issue_db;
USE campus_issue_db;

-- Users table (for all types of users)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('user', 'supervisor', 'admin') DEFAULT 'user',
    credits INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Issues table
CREATE TABLE issues (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category_id INT,
    status ENUM('pending', 'rejected', 'processing', 'completed') DEFAULT 'pending',
    user_id INT,
    supervisor_id INT NULL,
    upvotes INT DEFAULT 0,
    downvotes INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id)
);

-- Issue votes table (to track user votes)
CREATE TABLE issue_votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issue_id INT,
    user_id INT,
    vote_type ENUM('upvote', 'downvote'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_vote (issue_id, user_id),
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Comments table
CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issue_id INT,
    user_id INT,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Supervisor categories (to assign supervisors to categories)
CREATE TABLE supervisor_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supervisor_id INT,
    category_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_assignment (supervisor_id, category_id),
    FOREIGN KEY (supervisor_id) REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Credit transactions table
CREATE TABLE credit_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_supervisor_id INT NULL,
    to_supervisor_id INT NOT NULL,
    issue_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    transaction_type ENUM('reward', 'distribution') NOT NULL,
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
USE campus_issue_db;
SELECT * from users;
