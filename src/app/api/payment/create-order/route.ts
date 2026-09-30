import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, currency = 'INR', receipt, notes } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid payment amount is required' },
        { status: 400 }
      );
    }

    const key_id =
      process.env.RAZORPAY_KEY_ID ||
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
      'rzp_test_placeholderKey123';
    const key_secret =
      process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholderSecretKey123';

    // Amount in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(amount * 100);

    // If using placeholder credentials, provide a mock Razorpay order for seamless dev experience
    if (
      key_id === 'rzp_test_placeholderKey123' ||
      key_secret === 'rzp_secret_placeholderSecretKey123'
    ) {
      const mockOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return NextResponse.json({
        id: mockOrderId,
        amount: amountInPaise,
        currency,
        receipt: receipt || `rcpt_${Date.now()}`,
        status: 'created',
        isSimulation: true,
      });
    }

    const instance = new Razorpay({
      key_id,
      key_secret,
    });

    const order = await instance.orders.create({
      amount: amountInPaise,
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {},
    });

    return NextResponse.json(order);
  } catch (error: unknown) {
    console.error('Razorpay order creation error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to initiate payment gateway order';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
