using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Community.Kanban.Models;

namespace Umbraco.Community.Kanban.PropertyEditors;

/// <summary>
/// Configuration editor for the Kanban Calendar data type.
/// </summary>
public class KanbanCalendarConfigurationEditor(IIOHelper ioHelper)
    : ConfigurationEditor<KanbanCalendarConfiguration>(ioHelper);
