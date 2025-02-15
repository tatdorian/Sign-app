import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import socket
import threading
import time
from datetime import datetime
import json
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import os

class SecurityScannerGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Scanner de Sécurité")
        self.root.geometry("800x600")
        
        # Variables
        self.target_var = tk.StringVar()
        self.start_port_var = tk.StringVar(value="1")
        self.end_port_var = tk.StringVar(value="1024")
        self.scan_running = False
        self.scan_results = []
        self.scan_start_time = None
        self.scan_end_time = None
        
        # Style
        style = ttk.Style()
        style.configure('Custom.TButton', padding=5)
        
        self.create_widgets()
        
    def create_widgets(self):
        # [Le code existant des widgets reste inchangé]
        # Frame principal
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configuration de la cible
        target_frame = ttk.LabelFrame(main_frame, text="Configuration", padding="10")
        target_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(target_frame, text="Cible:").grid(row=0, column=0, sticky=tk.W)
        ttk.Entry(target_frame, textvariable=self.target_var, width=40).grid(row=0, column=1, padx=5)
        
        ttk.Label(target_frame, text="Port de début:").grid(row=1, column=0, sticky=tk.W)
        ttk.Entry(target_frame, textvariable=self.start_port_var, width=10).grid(row=1, column=1, sticky=tk.W, padx=5)
        
        ttk.Label(target_frame, text="Port de fin:").grid(row=2, column=0, sticky=tk.W)
        ttk.Entry(target_frame, textvariable=self.end_port_var, width=10).grid(row=2, column=1, sticky=tk.W, padx=5)
        
        # Boutons
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=1, column=0, columnspan=2, pady=10)
        
        self.scan_button = ttk.Button(button_frame, text="Démarrer le scan", 
                                    command=self.start_scan, style='Custom.TButton')
        self.scan_button.grid(row=0, column=0, padx=5)
        
        self.stop_button = ttk.Button(button_frame, text="Arrêter", 
                                     command=self.stop_scan, style='Custom.TButton',
                                     state=tk.DISABLED)
        self.stop_button.grid(row=0, column=1, padx=5)
        
        # Zone de résultats
        result_frame = ttk.LabelFrame(main_frame, text="Résultats", padding="10")
        result_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        
        self.result_text = scrolledtext.ScrolledText(result_frame, width=70, height=20)
        self.result_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Barre de progression
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(main_frame, length=300, 
                                          mode='determinate', 
                                          variable=self.progress_var)
        self.progress_bar.grid(row=3, column=0, columnspan=2, pady=10)
        
        # Barre de statut
        self.status_var = tk.StringVar(value="Prêt")
        self.status_label = ttk.Label(main_frame, textvariable=self.status_var)
        self.status_label.grid(row=4, column=0, columnspan=2)

    def generate_pdf_report(self):
        """Génère un rapport PDF détaillé du scan"""
        try:
            # Création du nom de fichier avec timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"scan_report_{timestamp}.pdf"
            
            # Création du document PDF
            doc = SimpleDocTemplate(filename, pagesize=letter)
            styles = getSampleStyleSheet()
            elements = []
            
            # Style personnalisé pour le titre
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                spaceAfter=30
            )
            
            # Ajout du titre
            elements.append(Paragraph(f"Rapport de Scan de Sécurité", title_style))
            elements.append(Spacer(1, 12))
            
            # Informations générales
            elements.append(Paragraph("Informations Générales", styles['Heading2']))
            elements.append(Spacer(1, 12))
            
            general_info = [
                ["Cible", self.target_var.get()],
                ["Date de début", self.scan_start_time.strftime("%Y-%m-%d %H:%M:%S")],
                ["Date de fin", self.scan_end_time.strftime("%Y-%m-%d %H:%M:%S")],
                ["Durée", f"{(self.scan_end_time - self.scan_start_time).total_seconds():.2f} secondes"],
                ["Plage de ports", f"{self.start_port_var.get()} - {self.end_port_var.get()}"]
            ]
            
            # Création du tableau d'informations générales
            t = Table(general_info, colWidths=[2*inch, 4*inch])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.grey),
                ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 12),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                ('BACKGROUND', (1, 0), (-1, -1), colors.white),
                ('TEXTCOLOR', (1, 0), (-1, -1), colors.black),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 20))
            
            # Résultats du scan
            elements.append(Paragraph("Résultats du Scan", styles['Heading2']))
            elements.append(Spacer(1, 12))
            
            # En-têtes pour les résultats
            if self.scan_results:
                results_data = [["Port", "Service", "État", "Description"]]
                for result in self.scan_results:
                    results_data.append([
                        str(result.get('port', '')),
                        result.get('service', ''),
                        result.get('state', ''),
                        result.get('description', '')
                    ])
                
                # Tableau des résultats
                t = Table(results_data, colWidths=[1*inch, 1.5*inch, 1*inch, 3.5*inch])
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.blue),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 12),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                    ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
                    ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black),
                    ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                    ('FONTSIZE', (0, 1), (-1, -1), 10),
                ]))
                elements.append(t)
            else:
                elements.append(Paragraph("Aucun port ouvert trouvé", styles['Normal']))
            
            # Génération du PDF
            doc.build(elements)
            
            # Message de confirmation
            messagebox.showinfo("Succès", f"Rapport PDF généré avec succès:\n{filename}")
            
            # Ouvrir le dossier contenant le rapport
            os.startfile(os.path.dirname(os.path.abspath(filename)))
            
        except Exception as e:
            messagebox.showerror("Erreur", f"Erreur lors de la génération du PDF:\n{str(e)}")

    def scan_port(self, target, port):
        """Scan un port spécifique et enregistre les résultats"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((target, port))
            if result == 0:
                service = self.get_service_name(port)
                result_data = {
                    'port': port,
                    'service': service,
                    'state': 'Ouvert',
                    'description': self.get_service_description(port)
                }
                self.scan_results.append(result_data)
                self.update_results(f"Port {port} ({service}) est ouvert\n")
            sock.close()
        except:
            pass

    def get_service_description(self, port):
        """Retourne une description détaillée du service"""
        descriptions = {
            20: "Service de transfert de données FTP",
            21: "Service de contrôle FTP",
            22: "Service SSH (Secure Shell)",
            23: "Service Telnet (Non sécurisé)",
            25: "Service SMTP (Simple Mail Transfer Protocol)",
            53: "Service DNS (Domain Name System)",
            80: "Service HTTP (Web)",
            443: "Service HTTPS (Web Sécurisé)",
            3306: "Service MySQL Database",
            3389: "Service Bureau à distance Windows"
        }
        return descriptions.get(port, "Service non identifié")

    def scan_target(self):
        """Fonction principale de scan avec génération de rapport"""
        self.scan_results = []  # Réinitialisation des résultats
        self.scan_start_time = datetime.now()
        
        # [Le reste du code de scan reste similaire]
        target = self.target_var.get()
        try:
            start_port = int(self.start_port_var.get())
            end_port = int(self.end_port_var.get())
        except ValueError:
            messagebox.showerror("Erreur", "Les ports doivent être des nombres entiers")
            return

        try:
            self.update_results(f"\nDébut du scan de {target}\n")
            self.update_results("=" * 50 + "\n")

            # Vérification DNS
            try:
                ip = socket.gethostbyname(target)
                self.update_results(f"Résolution DNS de {target}: {ip}\n")
            except socket.gaierror:
                self.update_results("Erreur de résolution DNS\n")
                return

            total_ports = end_port - start_port + 1
            ports_scanned = 0

            # Scan des ports
            for port in range(start_port, end_port + 1):
                if not self.scan_running:
                    break
                self.scan_port(target, port)
                ports_scanned += 1
                progress = (ports_scanned / total_ports) * 100
                self.update_progress(progress)
                self.update_status(f"Scan en cours... Port {port}/{end_port}")

            self.scan_end_time = datetime.now()
            duration = (self.scan_end_time - self.scan_start_time).total_seconds()
            
            # Rapport final
            self.update_results("\nRapport de scan:\n")
            self.update_results("=" * 50 + "\n")
            self.update_results(f"Scan terminé en {duration:.2f} secondes\n")
            
            # Génération du rapport PDF
            self.generate_pdf_report()

        except Exception as e:
            self.update_results(f"\nErreur lors du scan: {str(e)}\n")
        finally:
            self.scan_running = False
            self.scan_button.config(state=tk.NORMAL)
            self.stop_button.config(state=tk.DISABLED)
            self.update_status("Scan terminé")

def main():
    root = tk.Tk()
    app = SecurityScannerGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()