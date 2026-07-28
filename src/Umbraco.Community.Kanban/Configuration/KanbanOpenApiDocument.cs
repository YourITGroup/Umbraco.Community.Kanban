using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core.DependencyInjection;

namespace Umbraco.Community.Kanban.Configuration;

/// <summary>
/// Registers the package's own OpenAPI document, so its endpoints do not clutter
/// the core Management API document and can generate their own client.
/// </summary>
/// <remarks>
/// Umbraco 18's Management API generates its OpenAPI documents with the native
/// <c>Microsoft.AspNetCore.OpenApi</c> pipeline (<c>IUmbracoBuilder.AddBackOfficeOpenApiDocument</c>),
/// not Swashbuckle's <c>SwaggerGenOptions</c>/<c>IConfigureOptions&lt;SwaggerGenOptions&gt;</c> — there is
/// no <c>SwaggerGenOptions</c> type in this dependency graph. See the task-11 report for details.
/// </remarks>
public static class KanbanOpenApiDocument
{
    private const string Title = "Kanban Management API";

    /// <summary>
    /// Adds the Kanban API's own OpenAPI document, scoped to endpoints carrying
    /// <c>[MapToApi(Constants.ApiName)]</c>. Mirrors the defaults the core Management API
    /// applies to its own document (<c>Umbraco.Cms.Api.Management.DependencyInjection.UmbracoBuilderExtensions</c>):
    /// a title, the back-office security requirement advertised in the generated document, and the
    /// same named JSON options the back-office controller pipeline actually serializes with, so the
    /// generated schema matches runtime behaviour.
    /// </summary>
    public static IUmbracoBuilder AddKanbanOpenApiDocument(this IUmbracoBuilder builder) =>
        builder.AddBackOfficeOpenApiDocument(
            Constants.ApiName,
            document => document
                .WithTitle(Title)
                .WithBackOfficeAuthentication()
                .WithJsonOptions(Umbraco.Cms.Core.Constants.JsonOptionsNames.BackOffice));
}
