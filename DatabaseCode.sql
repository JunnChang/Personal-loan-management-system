CREATE DATABASE PLMS_DB;
GO;
USE PLMS_DB;

-- Tables
CREATE TABLE Roles (
    RoleID INT PRIMARY KEY IDENTITY,
    RoleName NVARCHAR(50) NOT NULL
);

CREATE TABLE Users (
    UserID INT PRIMARY KEY IDENTITY,
    FullName NVARCHAR(100) NOT NULL,
    ICNumber NVARCHAR(20),      -- will be masked with DDM
    Email NVARCHAR(100) UNIQUE NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    RoleID INT FOREIGN KEY REFERENCES Roles(RoleID),
    IsActive BIT DEFAULT 1
);

CREATE TABLE LoanProducts (
    ProductID INT PRIMARY KEY IDENTITY,
    ProductName NVARCHAR(100),
    InterestRate DECIMAL(5,2),
    MinAmount DECIMAL(18,2),
    MaxAmount DECIMAL(18,2),
    MaxTenorMonths INT
);

CREATE TABLE LoanApplications (
    ApplicationID INT PRIMARY KEY IDENTITY,
    CustomerID INT FOREIGN KEY REFERENCES Users(UserID),
    OfficerID INT FOREIGN KEY REFERENCES Users(UserID),
    LoanProductID INT FOREIGN KEY REFERENCES LoanProducts(ProductID),
    RequestedAmount DECIMAL(18,2),
    MonthlyIncome DECIMAL(18,2),  -- will be masked with DDM
    Status NVARCHAR(20) DEFAULT 'Pending',
    SubmittedAt DATETIME DEFAULT GETDATE()
);

CREATE TABLE Repayments (
    RepaymentID INT PRIMARY KEY IDENTITY,
    ApplicationID INT FOREIGN KEY REFERENCES LoanApplications(ApplicationID),
    DueDate DATE,
    AmountDue DECIMAL(18,2),
    AmountPaid DECIMAL(18,2) DEFAULT 0,
    Status NVARCHAR(20) DEFAULT 'Pending'
);

CREATE TABLE AuditLog (
    LogID INT PRIMARY KEY IDENTITY,
    EventType NVARCHAR(50),
    TableAffected NVARCHAR(50),
    PerformedBy NVARCHAR(100),
    AffectedRecordID INT,
    EventTimestamp DATETIME DEFAULT GETDATE()
);

-- logins
CREATE LOGIN plms_admin    WITH PASSWORD = 'Admin@12345!';
CREATE LOGIN plms_officer  WITH PASSWORD = 'Officer@12345!';
CREATE LOGIN plms_customer WITH PASSWORD = 'Customer@12345!';

-- DB users
USE PLMS_DB;
CREATE USER plms_admin    FOR LOGIN plms_admin;
CREATE USER plms_officer  FOR LOGIN plms_officer;
CREATE USER plms_customer FOR LOGIN plms_customer;

-- permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO plms_admin;

GRANT SELECT, UPDATE ON LoanApplications TO plms_officer;
GRANT INSERT ON Repayments TO plms_officer;

GRANT INSERT ON LoanApplications TO plms_customer;
GRANT SELECT ON LoanApplications TO plms_customer;
GRANT SELECT ON LoanProducts TO plms_customer;

-- DDM 
-- Mask IC number
ALTER TABLE Users
    ALTER COLUMN ICNumber ADD MASKED WITH (FUNCTION = 'partial(0,"XXXXXX",4)');

-- Mask monthly income
ALTER TABLE LoanApplications
    ALTER COLUMN MonthlyIncome ADD MASKED WITH (FUNCTION = 'default()');

-- Grant UNMASK to admin
GRANT UNMASK TO plms_admin;

-- RLS
-- Customers see only their own loan applications
CREATE SCHEMA Security;
GO

CREATE FUNCTION Security.fn_CustomerFilter(@CustomerID INT)
RETURNS TABLE
WITH SCHEMABINDING
AS RETURN
    SELECT 1 AS fn_result
    WHERE @CustomerID = USER_ID()    
       OR IS_MEMBER('db_owner') = 1;
GO

CREATE SECURITY POLICY CustomerRowFilter
ADD FILTER PREDICATE Security.fn_CustomerFilter(CustomerID)
ON dbo.LoanApplications
WITH (STATE = ON);