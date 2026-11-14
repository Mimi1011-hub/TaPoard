abstract class ControllerBase
{
    protected readonly AppState state;
    protected readonly IDesktop desktop;

    protected ControllerBase(AppState state, IDesktop desktop)
    {
        this.state = state;
        this.desktop = desktop;
    }
}
