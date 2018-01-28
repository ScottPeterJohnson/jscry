# jScry: Transforming JS on page load

### About
This is a project that showcases arbitrary transformation of JavaScript on page load. 
Currently, it allows you to:
- Track how many times each individual line of code executes on a page, and find code that's rarely executed.
- Add arbitrary JavaScript at arbitrary locations in the page 

### Running
You'll need a local Postgres database to build and run the project.
See [the database setup doc.](src/main/database/Schema.ddl)

Afterwards, run:

```
./gradlew webFiles run
```

The project should now be running at https://localhost:8080/

The localhost SSL certificate is self-signed, so you will need to manually accept it for your browser.

You can use it by adding script tags to your own pages, 
or by loading the web extension generated in build/webextension_dev into your browser. This allows you to
transform any website.