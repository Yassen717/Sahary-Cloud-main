'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  Receipt, 
  Download,
  Printer,
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertCircle,
  Building,
  Mail,
  Phone
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

type InvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  dueDate: string;
  issueDate: string;
  paidAt?: string | null;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  customer?: { firstName: string; lastName: string; email: string };
}

export default function InvoiceDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    loadInvoice();
  }, [params.id]);

  const loadInvoice = async () => {
    try {
      const response = await apiClient.getInvoice(params.id as string);
      const data = response?.data?.invoice;
      if (!data) throw new Error('Invoice not found');

      setInvoice({
        id: data.id,
        invoiceNumber: data.invoiceNumber,
        status: data.status,
        issueDate: data.createdAt,
        dueDate: data.dueDate,
        paidAt: data.paidAt,
        items: (data.items ?? []).map((item: any) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
        subtotal: Number(data.subtotal),
        tax: Number(data.tax),
        discount: Number(data.discount),
        total: Number(data.amount),
        customer: data.user,
      });
    } catch {
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    try {
      setPaying(true);
      const response = await apiClient.payInvoice(params.id as string);
      const paymentData = response?.data;

      // If the backend returns a hosted checkout URL, hand off to it
      const checkoutUrl = paymentData?.checkoutUrl || paymentData?.url;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      toast({
        title: 'Success',
        description:
          response?.message ||
          (paymentData?.clientSecret
            ? 'Payment initiated. Complete the payment to settle this invoice.'
            : 'Payment processed successfully'),
      });
      await loadInvoice();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process payment',
        variant: 'destructive',
      });
    } finally {
      setPaying(false);
    }
  };

  const handleDownload = () => {
    toast({
      title: 'Download Started',
      description: 'Your invoice PDF is being downloaded',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            Paid
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case 'OVERDUE':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <AlertCircle className="h-3 w-3 mr-1" />
            Overdue
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Invoice Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The requested invoice could not be found
            </p>
            <Button asChild>
              <Link href="/billing">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Billing
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const customer = invoice.customer ?? user;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6 print:hidden">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/billing">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Billing
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Receipt className="h-6 w-6 text-primary" />
                <CardTitle className="text-2xl">{invoice.invoiceNumber}</CardTitle>
                {getStatusBadge(invoice.status)}
              </div>
              <CardDescription>
                Issued: {new Date(invoice.issueDate).toLocaleDateString()} • 
                Due: {new Date(invoice.dueDate).toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Company & Customer Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Building className="h-4 w-4" />
                From
              </h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">Sahary Cloud</p>
                <p className="text-muted-foreground">123 Solar Street</p>
                <p className="text-muted-foreground">Cairo, Egypt</p>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  billing@saharycloud.com
                </p>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  +20 123 456 7890
                </p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Bill To</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{customer ? `${customer.firstName} ${customer.lastName}` : ''}</p>
                <p className="text-muted-foreground">{customer?.email}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Invoice Items */}
          <div>
            <h3 className="font-semibold mb-4">Invoice Items</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-medium">Description</th>
                    <th className="text-right p-3 font-medium">Qty</th>
                    <th className="text-right p-3 font-medium">Unit Price</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-3">{item.description}</td>
                      <td className="text-right p-3">{item.quantity}</td>
                      <td className="text-right p-3">${item.unitPrice.toFixed(2)}</td>
                      <td className="text-right p-3 font-medium">${item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full md:w-1/2 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">${invoice.subtotal.toFixed(2)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount:</span>
                  <span className="font-medium">-${invoice.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax:</span>
                <span className="font-medium">${invoice.tax.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span>${invoice.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Button */}
          {['PENDING', 'OVERDUE'].includes(invoice.status) && (
            <>
              <Separator className="print:hidden" />
              <div className="flex justify-end print:hidden">
                <Button onClick={handlePayment} disabled={paying} size="lg">
                  {paying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Pay ${invoice.total.toFixed(2)}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {invoice.status === 'PAID' && invoice.paidAt && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-400">
                <CheckCircle className="h-5 w-5" />
                <div>
                  <p className="font-semibold">Payment Received</p>
                  <p className="text-sm">
                    Paid on {new Date(invoice.paidAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
