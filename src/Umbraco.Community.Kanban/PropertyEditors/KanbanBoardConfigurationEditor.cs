using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// Configuration editor for the Kanban Board data type.
/// </summary>
public class KanbanBoardConfigurationEditor(IIOHelper ioHelper)
    : ConfigurationEditor<KanbanBoardConfiguration>(ioHelper);
