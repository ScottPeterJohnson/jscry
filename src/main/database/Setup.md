Install the database package:
> sudo apt-get install postgresql-9.6

Change to postgres user:
> sudo su - postgres

Create postgres jscry user to log in to database:
> createuser --interactive

 Enter 'jscry' with 'y' as superuser.
 Then do it again with jscry_test

Create the database:
> createdb jscry
> createdb jscry_test

 In psql:
 > psql
 > ALTER USER jscry PASSWORD 'jscry';
 > ALTER USER jscry_test PASSWORD 'jscry_test';
 
 Type "\q" to exit the postgres console.

 Create Linux users to log in to database:
 > sudo adduser jscry
 > sudo passwd jscry
 
 Enter "jscry" as password. Repeat for jscry_test.

Run Schema.ddl file on both databases!