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
  listSubtotalFormatted: string
  courseDiscountFormatted: string | null
  comboDiscountFormatted: string | null
  totalDiscountFormatted: string | null
  totalFormatted: string
  paymentMethod: string | null
  items: Array<{
    title: string
    listPriceFormatted: string
    courseDiscountFormatted: string | null
    comboDiscountFormatted: string | null
    finalPriceFormatted: string
  }>
  discountLines: Array<{
    label: string
    amountFormatted: string
  }>
  dashboardUrl: string
}

export function PurchaseConfirmation({
  customerName,
  orderReference,
  orderDate,
  listSubtotalFormatted,
  courseDiscountFormatted,
  comboDiscountFormatted,
  totalDiscountFormatted,
  totalFormatted,
  paymentMethod,
  items,
  discountLines,
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
            {items.map((item, index) => (
              <Section key={`${orderReference}-${index}-${item.title}`} style={courseRow}>
                <Text style={courseItem}>{item.title}</Text>
                <Text style={courseMeta}>Lista: {item.listPriceFormatted}</Text>
                {item.courseDiscountFormatted && (
                  <Text style={courseMeta}>
                    Promo curso: -{item.courseDiscountFormatted}
                  </Text>
                )}
                {item.comboDiscountFormatted && (
                  <Text style={courseMeta}>
                    Combo: -{item.comboDiscountFormatted}
                  </Text>
                )}
                <Text style={courseTotal}>Final: {item.finalPriceFormatted}</Text>
              </Section>
            ))}
          </Section>

          <Section style={totalBox}>
            <Text style={totalLine}>
              Subtotal lista: {listSubtotalFormatted}
            </Text>
            {courseDiscountFormatted && (
              <Text style={totalLine}>
                Descuentos por curso: -{courseDiscountFormatted}
              </Text>
            )}
            {comboDiscountFormatted && (
              <Text style={totalLine}>
                Combos: -{comboDiscountFormatted}
              </Text>
            )}
            {discountLines.length > 0 && (
              <Section style={detailBox}>
                <Text style={detailHeading}>Detalle de promociones</Text>
                {discountLines.map((line, index) => (
                  <Text key={`${index}-${line.label}-${line.amountFormatted}`} style={detailLine}>
                    {line.label}: -{line.amountFormatted}
                  </Text>
                ))}
              </Section>
            )}
            <Hr style={hr} />
            {totalDiscountFormatted && (
              <Text style={totalLine}>
                Total descuento: -{totalDiscountFormatted}
              </Text>
            )}
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
  fontWeight: "600",
  margin: "0 0 4px",
}

const courseRow: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "8px 0",
}

const courseMeta: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "2px 0",
}

const courseTotal: React.CSSProperties = {
  color: "#111827",
  fontSize: "13px",
  fontWeight: "600",
  margin: "4px 0 0",
}

const totalBox: React.CSSProperties = {
  margin: "16px 0",
}

const detailBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  marginTop: "12px",
  padding: "12px",
}

const detailHeading: React.CSSProperties = {
  color: "#111827",
  fontSize: "13px",
  fontWeight: "600",
  margin: "0 0 8px",
}

const detailLine: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "12px",
  margin: "4px 0",
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
