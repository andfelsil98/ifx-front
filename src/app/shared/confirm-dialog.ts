import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
@Component({
  selector: 'app-confirm-dialog', standalone: true, imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 mat-dialog-title>Eliminar máquina virtual</h2>
    <mat-dialog-content><p>¿Quieres eliminar <strong>{{ name }}</strong>?</p><p>Esta acción no se puede deshacer.</p></mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="false">Cancelar</button>
    <button mat-flat-button class="danger-button" [mat-dialog-close]="true">Eliminar VM</button></mat-dialog-actions>`,
})
export class ConfirmDialog { readonly name = inject<string>(MAT_DIALOG_DATA); }
