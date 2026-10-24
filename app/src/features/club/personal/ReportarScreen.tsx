import { MobileHeader } from '../../../design-system';
import { FormularioReporte } from '../edecan/Reportar';
import { Frame } from '../socio/ui/Frame';

/** Report a problem: type, what happened, Enviar. */
export function ReportarScreen() {
  return (
    <Frame header={<MobileHeader title="Reportar" />}>
      <FormularioReporte />
    </Frame>
  );
}
