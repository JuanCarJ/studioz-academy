import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface PurchaseConfirmationProps {
  customerName: string
  orderReference: string
  orderDate: string
  subtotalFormatted: string
  discountFormatted: string | null
  totalFormatted: string
  paymentMethod: string | null
  courseNames: string[]
  dashboardUrl: string
}

export function PurchaseConfirmation({
  customerName,
  orderReference,
  orderDate,
  subtotalFormatted,
  discountFormatted,
  totalFormatted,
  paymentMethod,
  courseNames,
  dashboardUrl,
}: PurchaseConfirmationProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Confirmacion de compra - Studio Z Academy ({orderReference})
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Studio Z Academy</Heading>
          <Hr style={hr} />

          <Text style={paragraph}>
            Hola <strong>{customerName}</strong>,
          </Text>

          <Text style={paragraph}>
            Tu compra ha sido confirmada. Aqui tienes el resumen de tu orden:
          </Text>

          <Section style={orderBox}>
            <Text style={orderLabel}>Referencia</Text>
            <Text style={orderValue}>{orderReference}</Text>

            <Text style={orderLabel}>Fecha</Text>
            <Text style={orderValue}>{orderDate}</Text>

            {paymentMethod && (
              <>
                <Text style={orderLabel}>Metodo de pago</Text>
                <Text style={orderValue}>{paymentMethod}</Text>
              </>
            )}
          </Section>

          <Section style={coursesBox}>
            <Text style={coursesHeading}>Cursos adquiridos</Text>
            {courseNames.map((name) => (
              <Text key={name} style={courseItem}>
                {name}
              </Text>
            ))}
          </Section>

          <Section style={totalBox}>
            <Text style={totalLine}>
              Subtotal: {subtotalFormatted}
            </Text>
            {discountFormatted && (
              <Text style={totalLine}>
                Descuento: -{discountFormatted}
              </Text>
            )}
            <Hr style={hr} />
            <Text style={totalHighlight}>
              Total: {totalFormatted}
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button style={ctaButton} href={dashboardUrl}>
              Ir a mis cursos
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Si tienes preguntas, contactanos por WhatsApp o responde a este
            correo.
          </Text>

          <Text style={footer}>
            Studio Z Academy - studiozacademy.com
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// ── Styles ──────────────────────────────────────────────────
const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
  borderRadius: "8px",
}

const heading: React.CSSProperties = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "700",
  textAlign: "center" as const,
  margin: "0 0 16px",
}

const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
}

const paragraph: React.CSSProperties = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 12px",
}

const orderBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "16px",
  margin: "16px 0",
}

const orderLabel: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "8px 0 2px",
}

const orderValue: React.CSSProperties = {
  color: "#111827",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 8px",
}

const coursesBox: React.CSSProperties = {
  margin: "16px 0",
}

const coursesHeading: React.CSSProperties = {
  color: "#111827",
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 8px",
}

const courseItem: React.CSSProperties = {
  color: "#374151",
  fontSize: "14px",
  padding: "6px 0",
  borderBottom: "1px solid #f3f4f6",
  margin: "0",
}

const totalBox: React.CSSProperties = {
  margin: "16px 0",
}

const totalLine: React.CSSProperties = {
  color: "#374151",
  fontSize: "14px",
  margin: "4px 0",
}

const totalHighlight: React.CSSProperties = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: "700",
  margin: "8px 0",
}

const ctaSection: React.CSSProperties = {
  textAlign: "center" as const,
  margin: "24px 0",
}

const ctaButton: React.CSSProperties = {
  backgroundColor: "#111827",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "12px 24px",
  display: "inline-block",
}

const footer: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
  textAlign: "center" as const,
  margin: "4px 0",
}
