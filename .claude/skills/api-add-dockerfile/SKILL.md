---
name: api-add-dockerfile
description: Scaffold a multi-stage Dockerfile and .dockerignore for an ASP.NET Core API or Worker project
---

# Add Dockerfile

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `api-containers.md` — container configuration requirements, environment variable handling, and deployment conventions

---

Scaffold a production-ready multi-stage Dockerfile and `.dockerignore`. The build stage compiles and publishes; the runtime stage contains only the published output.

## Steps

1. Identify the project type — API or Worker. Ask if unclear.
2. Identify the `.csproj` filename and root namespace from the existing project.
3. Check whether a `Dockerfile` already exists at the project root. If it does, stop and tell the user.
4. Create `Dockerfile` using the correct template below.
5. Create `.dockerignore` at the same location using the template below.
6. Tell the user the image is built with `az acr build` or `docker build` — not `dotnet run`.

## API Dockerfile Template

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY {{ProjectName}}/{{ProjectName}}.csproj {{ProjectName}}/
RUN dotnet restore {{ProjectName}}/{{ProjectName}}.csproj

COPY . .
RUN dotnet publish {{ProjectName}}/{{ProjectName}}.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "{{ProjectName}}.dll"]
```

## Worker Dockerfile Template

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY {{ProjectName}}/{{ProjectName}}.csproj {{ProjectName}}/
RUN dotnet restore {{ProjectName}}/{{ProjectName}}.csproj

COPY . .
RUN dotnet publish {{ProjectName}}/{{ProjectName}}.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/runtime:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "{{ProjectName}}.dll"]
```

## .dockerignore Template

```
**/bin
**/obj
**/.vs
appsettings.*.json
.env
*.user
```

## Rules

- Replace `{{ProjectName}}` with the actual `.csproj` filename (without extension)
- API projects use `mcr.microsoft.com/dotnet/aspnet` runtime; Worker projects use `mcr.microsoft.com/dotnet/runtime`
- All container conventions (pinned base image tags, `mcr.microsoft.com` source, no secrets as build ARGs) are defined in `@.claude/rules/api-containers.md` — verify the generated Dockerfile complies
- Migrations are not run from the Dockerfile — see `@.claude/rules/api-data-access.md`
