<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <!-- Use iisnode to run server.js -->
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" resourceType="Unspecified" />
    </handlers>

    <!-- Rewrite all requests to server.js so Express handles routes -->
    <rewrite>
      <rules>
        <rule name="NodeJS_Route_All" stopProcessing="true">
          <match url=".*" />
          <action type="Rewrite" url="server.js" />
        </rule>
      </rules>
    </rewrite>

    <!-- iisnode settings -->
    <iisnode 
      node_env="production" 
      devErrorsEnabled="true"
      loggingEnabled="true"
      maxConcurrentRequestsPerProcess="1024"
    />

    <!-- Serve static content correctly -->
    <staticContent>
      <mimeMap fileExtension=".js" mimeType="application/javascript" />
      <mimeMap fileExtension=".css" mimeType="text/css" />
      <mimeMap fileExtension=".html" mimeType="text/html" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".svg" mimeType="image/svg+xml" />
    </staticContent>
  </system.webServer>
</configuration>
