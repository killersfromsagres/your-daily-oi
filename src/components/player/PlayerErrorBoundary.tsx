import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

interface Props {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PlayerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[PlayerErrorBoundary] Erro capturado no player:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "#0a0a0c",
            color: "#ffffff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              width: "100%",
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "1rem",
              padding: "2rem",
              textAlign: "center",
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem auto",
              }}
            >
              <AlertTriangle size={24} />
            </div>

            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Falha ao carregar o reprodutor
            </h2>

            <p style={{ fontSize: "0.875rem", color: "#9ca3af", marginBottom: "1.25rem" }}>
              {this.props.title ? `Ocorreu um problema ao inicializar ${this.props.title}.` : "Ocorreu um erro no reprodutor."}
            </p>

            {this.state.error && (
              <pre
                style={{
                  textAlign: "left",
                  fontSize: "0.75rem",
                  color: "#fca5a5",
                  backgroundColor: "rgba(0, 0, 0, 0.4)",
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  overflowX: "auto",
                  marginBottom: "1.5rem",
                  fontFamily: "monospace",
                }}
              >
                {String(this.state.error?.message || this.state.error)}
              </pre>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              {this.props.onBack && (
                <button
                  onClick={this.props.onBack}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.625rem 1.25rem",
                    borderRadius: "0.5rem",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    color: "#ffffff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                  }}
                >
                  <ArrowLeft size={16} />
                  Voltar
                </button>
              )}
              <button
                onClick={this.handleRetry}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1.25rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "#ffffff",
                  color: "#000000",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={16} />
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
