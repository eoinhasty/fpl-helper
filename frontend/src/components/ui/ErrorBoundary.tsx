import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When true, renders a full-page centred fallback instead of an inline card */
  fullPage?: boolean;
  /** Label shown in the fallback heading */
  name?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private retry = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;

    const label = this.props.name ?? "This section";
    const fallback = (
      <div className="rounded-2xl border border-border bg-card shadow-card p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">{label} ran into a problem</p>
        <p className="text-xs text-muted-foreground">{this.state.message}</p>
        <button
          onClick={this.retry}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );

    if (this.props.fullPage) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
          <div className="max-w-sm w-full mx-4">{fallback}</div>
        </div>
      );
    }

    return fallback;
  }
}
